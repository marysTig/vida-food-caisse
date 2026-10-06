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
  private val deviceId: String,
) {
  private val client = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .writeTimeout(20, TimeUnit.SECONDS)
    .build()

  private val jsonMedia = "application/json".toMediaType()
  private val rest = "$baseUrl/rest/v1"

  companion object {
    private const val TAG = "PrintJobRepo"
    const val MAX_ATTEMPTS = 3
    /** 2-printer profile — faster auto-recovery without storming the radio. */
    const val RETRY_BACKOFF_MS = 2500L
    const val RECEIPT_RETRY_BACKOFF_MS = 450L
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

  /** Release printing rows older than [staleMs] (any device) — mirrors JS reclaimStale. */
  fun reclaimStalePrinting(staleMs: Long = 90_000L) {
    val cutoff = isoAfter(-staleMs)
    val patchBody = JSONObject()
      .put("status", "pending")
      .put("claimed_by_device_id", JSONObject.NULL)
      .put("next_attempt_at", nowIso())
      .put("updated_at", nowIso())
      .put("error", "Stale printing reclaim")
    try {
      val result = patch(
        "/print_jobs?status=eq.printing&updated_at=lt.$cutoff",
        patchBody,
      )
      val n = try {
        JSONArray(result).length()
      } catch (_: Exception) {
        0
      }
      if (n > 0) Log.i(TAG, "reclaimed $n stale printing job(s)")
    } catch (e: Exception) {
      Log.w(TAG, "stale reclaim failed", e)
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

  fun markDone(jobId: String) {
    val now = nowIso()
    patch(
      "/print_jobs?id=eq.$jobId",
      JSONObject()
        .put("status", "done")
        .put("printed_at", now)
        .put("updated_at", now)
        .put("error", JSONObject.NULL),
    )
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

  /** @return "pending" or "needs_manual" */
  fun scheduleRetry(
    jobId: String,
    attemptCount: Int,
    message: String,
    backoffMs: Long,
  ): String {
    if (attemptCount >= MAX_ATTEMPTS) {
      patch(
        "/print_jobs?id=eq.$jobId",
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
      "/print_jobs?id=eq.$jobId",
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

  /**
   * Patch kitchen fingerprints on table_orders.items so deltas do not reprint.
   * NetExecutor only — never block the radio thread.
   */
  fun patchKitchenFingerprints(tableId: String, fingerprints: JSONObject) {
    if (fingerprints.length() == 0) return
    val uuidRe =
      Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
    if (!uuidRe.matches(tableId)) {
      Log.i(TAG, "skip fingerprint patch — non-uuid tableId=$tableId")
      return
    }
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
