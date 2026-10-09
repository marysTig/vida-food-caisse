package com.marystig.vidafoodcaisse.print

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Supabase PostgREST client for print_jobs (+ kitchen fingerprint patch).
 * Network-only — never call from the radio thread for claim/ack/fingerprints.
 */
class PrintJobRepository(
  private val baseUrl: String,
  private val anonKey: String,
  val deviceId: String,
) {
  private val client = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .writeTimeout(20, TimeUnit.SECONDS)
    .build()

  private val jsonMedia = "application/json".toMediaType()
  private val rest = "$baseUrl/rest/v1"

  /** Set once the atomic fingerprint RPC is confirmed missing (migration not run). */
  @Volatile private var markPrintedRpcMissing = false

  companion object {
    private const val TAG = "PrintJobRepo"
    const val PRINT_SETTINGS_ROW_ID = "00000000-0000-4000-8000-000000000001"
    /** Keep finished jobs this long before cleanup_print_jobs deletes them. */
    const val JOB_RETENTION_DAYS = 7
    const val MAX_ATTEMPTS = 3
    /** 2-printer profile — faster auto-recovery without storming the radio. */
    const val RETRY_BACKOFF_MS = 2500L
    /** After connect fail, give ACL time before retry (was 450 — too tight). */
    const val RECEIPT_RETRY_BACKOFF_MS = 1_200L
    const val CLAIM_BATCH_LIMIT = 8
  }

  private fun authHeaders(builder: Request.Builder): Request.Builder =
    builder
      .header("apikey", anonKey)
      .header("Authorization", "Bearer $anonKey")
      .header("Prefer", "return=representation")

  private fun nowIso(): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(Date())
  }

  private fun isoAfter(msFromNow: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(Date(System.currentTimeMillis() + msFromNow))
  }

  private fun get(path: String): String {
    val req = authHeaders(Request.Builder().url("$rest$path").get()).build()
    client.newCall(req).execute().use { resp ->
      val body = resp.body?.string().orEmpty()
      if (!resp.isSuccessful) {
        throw IllegalStateException("GET $path → ${resp.code}: $body")
      }
      return body
    }
  }

  private fun patch(path: String, json: JSONObject): String {
    val req = authHeaders(
      Request.Builder()
        .url("$rest$path")
        .patch(json.toString().toRequestBody(jsonMedia)),
    ).build()
    client.newCall(req).execute().use { resp ->
      val body = resp.body?.string().orEmpty()
      if (!resp.isSuccessful) {
        throw IllegalStateException("PATCH $path → ${resp.code}: $body")
      }
      return body
    }
  }

  private fun post(path: String, json: JSONObject): Pair<Int, String> {
    val req = authHeaders(
      Request.Builder()
        .url("$rest$path")
        .post(json.toString().toRequestBody(jsonMedia)),
    ).build()
    client.newCall(req).execute().use { resp ->
      return resp.code to resp.body?.string().orEmpty()
    }
  }

  private fun postRpc(name: String, json: JSONObject): String {
    val req = authHeaders(
      Request.Builder()
        .url("$rest/rpc/$name")
        .post(json.toString().toRequestBody(jsonMedia)),
    ).build()
    client.newCall(req).execute().use { resp ->
      val body = resp.body?.string().orEmpty()
      if (!resp.isSuccessful) {
        throw IllegalStateException("RPC $name → ${resp.code}: $body")
      }
      return body
    }
  }

  fun countActiveJobs(): Int {
    return try {
      val body = get(
        "/print_jobs?select=id&status=in.(pending,printing)&limit=50",
      )
      JSONArray(body).length()
    } catch (e: Exception) {
      Log.w(TAG, "countActiveJobs failed", e)
      0
    }
  }

  fun reclaimPrintingForDevice() {
    val now = nowIso()
    val patchBody = JSONObject()
      .put("status", "pending")
      .put("claimed_by_device_id", JSONObject.NULL)
      .put("next_attempt_at", now)
      .put("updated_at", now)
      .put("error", "Worker restarted")
    try {
      patch(
        "/print_jobs?status=eq.printing&claimed_by_device_id=eq.$deviceId",
        patchBody,
      )
      Log.i(TAG, "reclaimed printing jobs for $deviceId")
    } catch (e: Exception) {
      Log.w(TAG, "reclaim failed", e)
    }
  }

  /**
   * Release `printing` rows older than [staleMs].
   * Other devices' rows: released wholesale. This device's rows: only those not in
   * [heldIds] — a held row is queued or mid-print here, and resetting it caused
   * re-claim + double print under backlog.
   */
  fun reclaimStalePrinting(heldIds: Set<String>, staleMs: Long = 90_000L) {
    val cutoff = isoAfter(-staleMs)
    val patchBody = JSONObject()
      .put("status", "pending")
      .put("claimed_by_device_id", JSONObject.NULL)
      .put("next_attempt_at", nowIso())
      .put("updated_at", nowIso())
      .put("error", "Stale printing reclaim")
    try {
      val result = patch(
        "/print_jobs?status=eq.printing&updated_at=lt.$cutoff" +
          "&or=(claimed_by_device_id.is.null,claimed_by_device_id.neq.$deviceId)",
        patchBody,
      )
      val n = try {
        JSONArray(result).length()
      } catch (_: Exception) {
        0
      }
      if (n > 0) Log.i(TAG, "reclaimed $n stale printing job(s) from other devices")
    } catch (e: Exception) {
      Log.w(TAG, "stale reclaim failed", e)
    }

    try {
      val own = JSONArray(
        get(
          "/print_jobs?select=id&status=eq.printing" +
            "&claimed_by_device_id=eq.$deviceId&updated_at=lt.$cutoff&limit=50",
        ),
      )
      for (i in 0 until own.length()) {
        val id = own.getJSONObject(i).getString("id")
        if (id in heldIds) continue
        patch(
          "/print_jobs?id=eq.$id&status=eq.printing&claimed_by_device_id=eq.$deviceId",
          patchBody,
        )
        Log.i(TAG, "reclaimed orphaned own job ${id.take(8)}")
      }
    } catch (e: Exception) {
      Log.w(TAG, "own orphan reclaim failed", e)
    }
  }

  /**
   * Atomic batch claim via Postgres RPC. Receipt-hold is enforced server-side.
   */
  fun claimBatch(limit: Int = CLAIM_BATCH_LIMIT): List<NativePrintJob> {
    val t0 = System.currentTimeMillis()
    val body = postRpc(
      "claim_print_jobs",
      JSONObject()
        .put("p_device_id", deviceId)
        .put("p_limit", limit),
    )
    val arr = JSONArray(body)
    val out = ArrayList<NativePrintJob>(arr.length())
    for (i in 0 until arr.length()) {
      out.add(NativePrintJob.fromJson(arr.getJSONObject(i)))
    }
    Log.i(
      TAG,
      "claimBatch · n=${out.size} · claim_ms=${System.currentTimeMillis() - t0}",
    )
    return out
  }

  /**
   * Mark printed. Guarded to printing/pending: the ticket physically printed, so a
   * row reset to pending behind our back must still close (prevents a reprint),
   * but done/needs_manual/cancelled rows are left alone.
   * @return false when no row matched.
   */
  fun markDone(jobId: String): Boolean {
    val now = nowIso()
    val result = patch(
      "/print_jobs?id=eq.$jobId&status=in.(printing,pending)",
      JSONObject()
        .put("status", "done")
        .put("printed_at", now)
        .put("updated_at", now)
        .put("error", JSONObject.NULL),
    )
    return try {
      JSONArray(result).length() > 0
    } catch (_: Exception) {
      true
    }
  }

  fun requeueInterrupted(jobId: String) {
    patch(
      "/print_jobs?id=eq.$jobId&status=eq.printing",
      JSONObject()
        .put("status", "pending")
        .put("next_attempt_at", nowIso())
        .put("claimed_by_device_id", JSONObject.NULL)
        .put("error", "Interrompu pour ticket caisse")
        .put("updated_at", nowIso()),
    )
  }

  /**
   * Only touches rows still `printing` for this device — never clobbers a row
   * another claimant took or one already marked done.
   * @return "pending" or "needs_manual"
   */
  fun scheduleRetry(
    jobId: String,
    attemptCount: Int,
    message: String,
    backoffMs: Long,
  ): String {
    val guard = "/print_jobs?id=eq.$jobId&status=eq.printing&claimed_by_device_id=eq.$deviceId"
    if (attemptCount >= MAX_ATTEMPTS) {
      patch(
        guard,
        JSONObject()
          .put("status", "needs_manual")
          .put("attempt_count", attemptCount)
          .put("error", message)
          .put("claimed_by_device_id", JSONObject.NULL)
          .put("updated_at", nowIso()),
      )
      return "needs_manual"
    }
    patch(
      guard,
      JSONObject()
        .put("status", "pending")
        .put("attempt_count", attemptCount)
        .put("next_attempt_at", isoAfter(backoffMs))
        .put("error", message)
        .put("claimed_by_device_id", JSONObject.NULL)
        .put("updated_at", nowIso()),
    )
    return "pending"
  }

  fun retryAllNeedsManual(): Int {
    val now = nowIso()
    val result = patch(
      "/print_jobs?status=eq.needs_manual",
      JSONObject()
        .put("status", "pending")
        .put("attempt_count", 0)
        .put("next_attempt_at", now)
        .put("claimed_by_device_id", JSONObject.NULL)
        .put("error", JSONObject.NULL)
        .put("updated_at", now),
    )
    return try {
      JSONArray(result).length()
    } catch (_: Exception) {
      0
    }
  }

  /** print_settings singleton; null when unreachable (keep previous settings). */
  fun fetchHubSettings(): HubSettings? {
    return try {
      val arr = JSONArray(get("/print_settings?select=*&id=eq.$PRINT_SETTINGS_ROW_ID&limit=1"))
      if (arr.length() == 0) null else HubSettings.fromJson(arr.getJSONObject(0))
    } catch (e: Exception) {
      Log.w(TAG, "fetchHubSettings failed: ${e.message}")
      null
    }
  }

  /** Enabled Bluetooth kitchen printers; null when unreachable. */
  fun fetchKitchenPrinters(): List<KitchenPrinter>? {
    return try {
      val arr = JSONArray(get("/printers?select=*&enabled=eq.true&type=eq.cuisine"))
      val out = ArrayList<KitchenPrinter>()
      for (i in 0 until arr.length()) {
        val row = arr.getJSONObject(i)
        if (row.optString("transport", "bluetooth").equals("usb", ignoreCase = true)) continue
        val mac = row.optString("mac_address", "").trim()
        if (mac.isEmpty()) continue
        out.add(KitchenPrinter(row.getString("id"), row.optString("name", "Cuisine"), mac))
      }
      out
    } catch (e: Exception) {
      Log.w(TAG, "fetchKitchenPrinters failed: ${e.message}")
      null
    }
  }

  /**
   * Reroute a kitchen ticket to [target]: insert a consol copy (idempotent via
   * `consol|<jobId>|<targetId>`, same key as the JS auto-consol) then cancel the
   * original if it is still ours.
   * @return false when the copy could not be inserted (caller retries normally).
   */
  fun rerouteKitchenJob(
    job: NativePrintJob,
    target: KitchenPrinter,
    escposBase64: String,
    reason: String,
  ): Boolean {
    val now = nowIso()
    val payload = JSONObject(job.payload.toString())
      .put("escposBase64", escposBase64)
      .put("consolOfJobId", job.id)
    val row = JSONObject()
      .put("table_id", job.rowTableId ?: JSONObject.NULL)
      .put("job_type", "kitchen")
      .put("priority", job.priority)
      .put("printer_id", target.id)
      .put("printer_name", target.name)
      .put("transport", "bluetooth")
      .put("mac_address", target.macAddress)
      .put("idempotency_key", "consol|${job.id}|${target.id}")
      .put("status", "pending")
      .put("attempt_count", 0)
      .put("next_attempt_at", now)
      .put("payload", payload)
      .put("error", "Basculé depuis ${job.printerName ?: "?"}")
      .put("updated_at", now)
    val (code, body) = post("/print_jobs", row)
    if (code !in 200..299 && code != 409) {
      Log.w(TAG, "reroute insert failed → $code: $body")
      return false
    }
    patch(
      "/print_jobs?id=eq.${job.id}&status=eq.printing&claimed_by_device_id=eq.$deviceId",
      JSONObject()
        .put("status", "cancelled")
        .put("claimed_by_device_id", JSONObject.NULL)
        .put("error", "Basculé vers ${target.name} — $reason")
        .put("updated_at", nowIso()),
    )
    return true
  }

  /**
   * Mark kitchen lines printed. Prefers the atomic RPC (only touches the
   * fingerprint fields of matching items — never overwrites cashier edits);
   * falls back to read-modify-write until the migration is applied.
   */
  fun markKitchenItemsPrinted(tableId: String, fingerprints: JSONObject) {
    if (fingerprints.length() == 0) return
    if (!UUID_RE.matches(tableId)) {
      Log.i(TAG, "skip fingerprint patch — non-uuid tableId=$tableId")
      return
    }
    if (!markPrintedRpcMissing) {
      try {
        postRpc(
          "mark_kitchen_items_printed",
          JSONObject()
            .put("p_table_id", tableId)
            .put("p_fingerprints", fingerprints)
            .put("p_printed_at", nowIso()),
        )
        Log.i(TAG, "kitchen items marked printed (rpc) · $tableId")
        return
      } catch (e: Exception) {
        val msg = e.message.orEmpty()
        if ("PGRST202" in msg || "→ 404" in msg) {
          markPrintedRpcMissing = true
          Log.w(TAG, "mark_kitchen_items_printed missing — legacy patch until migration")
        } else {
          Log.w(TAG, "mark_kitchen_items_printed failed: $msg")
          return
        }
      }
    }
    patchKitchenFingerprints(tableId, fingerprints)
  }

  /** Deletes finished jobs older than [JOB_RETENTION_DAYS]; no-op before migration. */
  fun cleanupOldJobs() {
    try {
      val body = postRpc(
        "cleanup_print_jobs",
        JSONObject().put("p_keep_days", JOB_RETENTION_DAYS),
      )
      Log.i(TAG, "cleanup_print_jobs · deleted=$body")
    } catch (e: Exception) {
      Log.w(TAG, "cleanup_print_jobs unavailable: ${e.message}")
    }
  }

  private val UUID_RE =
    Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

  /**
   * Legacy read-modify-write fingerprint patch (pre-migration fallback only —
   * races with cashier upserts; see mark_kitchen_items_printed).
   */
  private fun patchKitchenFingerprints(tableId: String, fingerprints: JSONObject) {
    try {
      val body = get("/table_orders?select=table_id,items&table_id=eq.$tableId&limit=1")
      val arr = JSONArray(body)
      if (arr.length() == 0) return
      val row = arr.getJSONObject(0)
      val items = row.optJSONArray("items") ?: return
      val printedAt = nowIso()
      var changed = false
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        val itemId = item.optString("id", "")
        if (itemId.isBlank() || !fingerprints.has(itemId)) continue
        val fp = fingerprints.getString(itemId)
        item.put("kitchenFingerprint", fp)
        item.put("kitchenPrintedAt", printedAt)
        changed = true
      }
      if (!changed) return
      patch(
        "/table_orders?table_id=eq.$tableId",
        JSONObject()
          .put("items", items)
          .put("updated_at", nowIso()),
      )
      Log.i(TAG, "patched kitchen fingerprints for $tableId")
    } catch (e: Exception) {
      Log.w(TAG, "fingerprint patch failed", e)
    }
  }
}
