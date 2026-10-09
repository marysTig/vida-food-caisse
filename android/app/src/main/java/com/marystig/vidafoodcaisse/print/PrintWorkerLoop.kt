package com.marystig.vidafoodcaisse.print

import android.util.Base64
import android.util.Log
import java.io.IOException
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Split USB / Bluetooth / net drain:
 * - USB thread: Caisse (and any transport=usb) → EscPosUsbPrinter
 * - Bluetooth lanes ([BtLane]): one thread + persistent session per kitchen
 *   printer (parallel mode), or one shared lane (serialized fallback mode)
 * - Net thread: claim RPC → lanes / USB queue; acks; settings + hub ownership;
 *   reroutes; stale reclaim; cleanup
 */
class PrintWorkerLoop(
  private val repo: PrintJobRepository,
  private val btPrinterFactory: (persistent: Boolean) -> EscPosBluetoothPrinter,
  private val usbPrinter: EscPosUsbPrinter,
  /** Last lane mode seen (SharedPreferences) — used until print_settings loads. */
  initialLaneMode: String,
  private val persistLaneMode: (String) -> Unit,
  private val onStatus: (running: Boolean, queueDepth: Int, lastError: String?) -> Unit,
) {
  companion object {
    private const val TAG = "PrintWorkerLoop"
    private const val POLL_IDLE_MS = 800L
    /** Wake-responsive sleep slice — must be << POLL_IDLE so claimed jobs start immediately. */
    private const val WAKE_SLICE_MS = 50L
    private const val USB_THREAD = "HubPrintUsb"
    private const val NET_THREAD = "HubPrintNet"
    private const val SERIAL_LANE_KEY = "serial"
    private const val HUB_STATE_REFRESH_MS = 15_000L
    private const val CLEANUP_FIRST_DELAY_MS = 60_000L
    private const val CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000L
    private const val ADMIN_TIMEOUT_MS = 60_000L
    /** Upper bound for a lane to finish its in-flight job (IO deadline ≤ 24s). */
    private const val LANE_STOP_JOIN_MS = 30_000L
  }

  private val running = AtomicBoolean(false)
  private val wake = AtomicBoolean(false)
  private val lastError = AtomicReference<String?>(null)
  private val localQueue = LocalPrintQueue()
  private val ackQueue = LinkedBlockingQueue<PrintAck>()
  /**
   * Job ids this worker owns: claimed → queued → in flight → ack persisted.
   * Stale reclaim must never reset these (reset + re-claim = double print).
   */
  private val heldJobIds: MutableSet<String> = ConcurrentHashMap.newKeySet()
  private val adminUsbQueue = LinkedBlockingQueue<() -> Unit>()

  private val lanesLock = Any()
  private val lanes = ConcurrentHashMap<String, BtLane>()
  private val breakers = ConcurrentHashMap<String, PrinterCircuitBreaker>()

  @Volatile private var settings =
    HubSettings(primaryDeviceId = "", laneMode = initialLaneMode, autoReroute = true)
  @Volatile private var kitchenPrinters: List<KitchenPrinter> = emptyList()
  /** False when print_settings names another device as primary hub. */
  @Volatile private var hubActive = true

  private var usbExecutor: ExecutorService? = null
  private var netExecutor: ExecutorService? = null

  fun isRunning(): Boolean = running.get()

  fun getLastError(): String? = lastError.get()

  fun listUsbDevices(): List<EscPosUsbPrinter.UsbDeviceInfo> = usbPrinter.listDevices()

  fun wake() {
    wake.set(true)
  }

  fun onUsbDeviceDetached(device: android.hardware.usb.UsbDevice) {
    usbPrinter.onDeviceDetached(device)
  }

  /** Hot-plug: permission + warm reconnect on the USB worker thread. */
  fun onUsbDeviceAttached(device: android.hardware.usb.UsbDevice) {
    runOnUsb {
      try {
        usbPrinter.onDeviceAttached(device)
      } catch (e: Exception) {
        Log.w(TAG, "USB attach handler: ${e.message}")
      }
    }
  }

  fun start() {
    if (!running.compareAndSet(false, true)) return
    usbPrinter.forceClose("loop-start")

    val usb = Executors.newSingleThreadExecutor { r ->
      Thread(r, USB_THREAD).apply { isDaemon = true }
    }
    val net = Executors.newSingleThreadExecutor { r ->
      Thread(r, NET_THREAD).apply { isDaemon = true }
    }
    usbExecutor = usb
    netExecutor = net

    net.execute {
      try {
        repo.reclaimPrintingForDevice()
        refreshHubState()
        onStatus(true, repo.countActiveJobs(), null)
      } catch (e: Exception) {
        Log.w(TAG, "startup reclaim failed", e)
      }
      netLoop()
    }
    usb.execute { usbLoop() }
    onStatus(true, 0, null)
    Log.i(TAG, "started · usb + bt lanes (${settings.laneMode}) + net")
  }

  fun stop() {
    running.set(false)
    wake.set(true)
    usbExecutor?.shutdownNow()
    netExecutor?.shutdownNow()
    usbExecutor = null
    netExecutor = null
    synchronized(lanesLock) {
      for (lane in lanes.values) lane.stop(2_000L)
      lanes.clear()
    }
    // Unacked jobs stay `printing` for this device; startup reclaim releases them.
    heldJobIds.clear()
    usbPrinter.forceClose("loop-stop")
    onStatus(false, 0, lastError.get())
    Log.i(TAG, "stopped")
  }

  fun triggerManualRetry() {
    netExecutor?.execute {
      try {
        val n = repo.retryAllNeedsManual()
        Log.i(TAG, "manual retry enqueued $n")
        wake()
      } catch (e: Exception) {
        lastError.set(e.message)
        Log.w(TAG, "manual retry failed", e)
      }
    }
  }

  // ── Bluetooth lanes ─────────────────────────────────────────────────────────

  private fun isParallel(): Boolean = settings.laneMode == HubSettings.MODE_PARALLEL

  private fun breakerFor(mac: String, name: String): PrinterCircuitBreaker {
    val key = PrinterLinkStatusHub.normalizeMac(mac)
    return breakers.getOrPut(key) { PrinterCircuitBreaker(key) { name } }
  }

  private fun laneFor(mac: String, name: String): BtLane = synchronized(lanesLock) {
    val parallel = isParallel()
    val key = if (parallel) PrinterLinkStatusHub.normalizeMac(mac) else SERIAL_LANE_KEY
    lanes[key] ?: BtLane(
      key = key,
      initialPrinterName = name,
      printer = btPrinterFactory(parallel),
      parallel = parallel,
      breakerFor = ::breakerFor,
      canReroute = ::canReroute,
      isActive = { hubActive && running.get() },
      ack = { a ->
        ackQueue.offer(a)
        wake()
      },
    ).also {
      lanes[key] = it
      it.start()
    }
  }

  private fun btDepth(): Int = lanes.values.sumOf { it.depth() }

  private fun dispatch(jobs: List<NativePrintJob>) {
    val usbJobs = ArrayList<NativePrintJob>()
    for (job in jobs) {
      if (job.isUsb) {
        usbJobs.add(job)
        continue
      }
      val mac = job.macAddress
      if (mac.isNullOrBlank()) {
        ackQueue.offer(PrintAck.BadPayload(job, "Payload ou MAC manquant", System.currentTimeMillis()))
        continue
      }
      laneFor(mac, job.printerName ?: "imprimante").offer(job)
    }
    if (usbJobs.isNotEmpty()) localQueue.offerAll(usbJobs)
  }

  /** Lane-mode switch from Admin: drain old lanes, re-offer their queued jobs. */
  private fun reconfigureLanes(newMode: String) {
    synchronized(lanesLock) {
      Log.i(TAG, "lane mode ${settings.laneMode} → $newMode")
      val old = lanes.values.toList()
      lanes.clear()
      settings = settings.copy(laneMode = newMode)
      persistLaneMode(newMode)
      val leftovers = old.flatMap { it.stop(LANE_STOP_JOIN_MS) }
      if (leftovers.isNotEmpty()) dispatch(leftovers)
      ensureEagerLanes()
    }
  }

  /** Parallel mode: one warm lane per enabled kitchen printer before any ticket. */
  private fun ensureEagerLanes() {
    if (!isParallel() || !hubActive) return
    synchronized(lanesLock) {
      val wanted = kitchenPrinters.map { PrinterLinkStatusHub.normalizeMac(it.macAddress) }.toSet()
      // Drop idle lanes for printers removed / re-addressed in Admin (stale sessions).
      // Lanes created on demand for other MACs come back with their next job.
      for ((key, lane) in lanes.entries.toList()) {
        if (key !in wanted && !lane.hasWork()) {
          lanes.remove(key)
          lane.stop(2_000L)
        }
      }
      for (p in kitchenPrinters) {
        laneFor(p.macAddress, p.name).printerName = p.name
      }
    }
  }

  private fun canReroute(job: NativePrintJob): Boolean =
    settings.autoReroute &&
      job.jobType == "kitchen" &&
      !job.isConsol &&
      pickRerouteTarget(job) != null

  private fun pickRerouteTarget(job: NativePrintJob): KitchenPrinter? {
    val srcMac = job.macAddress?.let { PrinterLinkStatusHub.normalizeMac(it) }
    return kitchenPrinters.firstOrNull { p ->
      val mac = PrinterLinkStatusHub.normalizeMac(p.macAddress)
      p.id != job.printerId &&
        mac != srcMac &&
        breakers[mac]?.blocksAttempt() != true
    }
  }

  /** ASCII header so the receiving station knows the ticket belongs elsewhere. */
  private fun rerouteEscPos(job: NativePrintJob, target: KitchenPrinter): String? {
    val b64 = job.escposBase64 ?: return null
    val original = try {
      Base64.decode(b64, Base64.DEFAULT)
    } catch (_: Exception) {
      return null
    }
    val from = asciiOnly(job.printerName ?: "?").uppercase()
    val header = StringBuilder()
      .append("\u001b@")
      .append("\u001ba\u0001")
      .append("\u001bE\u0001")
      .append("\u001d!\u0011")
      .append("REROUTE\n")
      .append("\u001d!\u0000")
      .append("Ticket $from\n")
      .append("($from indisponible -> ${asciiOnly(target.name)})\n")
      .append("\u001bE\u0000")
      .append("\u001ba\u0000")
      .append("--------------------------------\n")
      .toString()
      .toByteArray(Charsets.US_ASCII)
    return Base64.encodeToString(header + original, Base64.NO_WRAP)
  }

  private fun asciiOnly(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD)
      .replace(Regex("\\p{M}+"), "")
      .replace(Regex("[^\\x20-\\x7E]"), "?")

  // ── Admin (called from the plugin's background executor) ─────────────────────

  fun adminProbe(printerName: String, mac: String): Pair<Boolean, String> {
    val lane = laneFor(mac, printerName)
    // Serialized: one radio for every MAC — never steal it while jobs are pending.
    val remoteBusy = !lane.parallel && repo.countActiveJobs() > 0
    if (remoteBusy || lane.hasWork()) {
      return false to "File d'impression active — probe différé"
    }
    return try {
      lane.runAdminBlocking(ADMIN_TIMEOUT_MS) { lane.adminProbe(printerName, mac) }
      true to if (lane.parallel) "Joignable Bluetooth (session prête)" else "Joignable Bluetooth (ping OK)"
    } catch (e: Exception) {
      false to (e.message ?: "Erreur probe BT")
    }
  }

  fun adminUsbProbe(
    printerName: String,
    vendorId: Int,
    productId: Int,
  ): Pair<Boolean, String> {
    return runOnUsbBlocking {
      try {
        if (localQueue.hasUsbWork()) {
          return@runOnUsbBlocking false to "File USB active — probe différé"
        }
        usbPrinter.probeConnect(printerName, vendorId, productId)
        true to "Joignable USB (ping OK)"
      } catch (e: Exception) {
        false to (e.message ?: "Erreur probe USB")
      }
    }
  }

  fun adminTestPrint(printerName: String, mac: String, escposBase64: String): Pair<Boolean, String> {
    val lane = laneFor(mac, printerName)
    if (lane.hasWork()) {
      return false to "File d'impression active — test différé"
    }
    return try {
      lane.runAdminBlocking(ADMIN_TIMEOUT_MS) { lane.adminTestPrint(printerName, mac, escposBase64) }
      true to "OK"
    } catch (e: Exception) {
      false to (e.message ?: "Erreur impression test BT")
    }
  }

  fun adminUsbTestPrint(
    printerName: String,
    vendorId: Int,
    productId: Int,
    escposBase64: String,
  ): Pair<Boolean, String> {
    return runOnUsbBlocking {
      try {
        if (localQueue.hasUsbWork()) {
          return@runOnUsbBlocking false to "File USB active — test différé"
        }
        usbPrinter.sendEscPos(printerName, vendorId, productId, escposBase64)
        true to "OK"
      } catch (e: Exception) {
        usbPrinter.forceClose("admin-test-fail")
        false to (e.message ?: "Erreur impression test USB")
      }
    }
  }

  private fun runOnUsb(block: () -> Unit) {
    if (Thread.currentThread().name == USB_THREAD) {
      block()
      return
    }
    adminUsbQueue.offer(block)
    wake()
  }

  private fun <T> runOnUsbBlocking(block: () -> T): T {
    if (Thread.currentThread().name == USB_THREAD) return block()
    val latch = CountDownLatch(1)
    val result = AtomicReference<Any?>()
    val error = AtomicReference<Exception?>()
    adminUsbQueue.offer {
      try {
        result.set(block())
      } catch (e: Exception) {
        error.set(e)
      } finally {
        latch.countDown()
      }
    }
    wake()
    if (!latch.await(90, TimeUnit.SECONDS)) {
      throw IOException("Admin USB op timeout — worker busy")
    }
    error.get()?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return result.get() as T
  }

  private fun drainAdminUsbOps() {
    while (true) {
      val op = adminUsbQueue.poll() ?: break
      try {
        op()
      } catch (e: Exception) {
        Log.w(TAG, "admin USB op failed", e)
      }
    }
  }

  // ── Net thread ──────────────────────────────────────────────────────────────

  /** print_settings + kitchen printers: lane mode, reroute, hub ownership. */
  private fun refreshHubState() {
    repo.fetchKitchenPrinters()?.let { kitchenPrinters = it }
    val s = repo.fetchHubSettings() ?: return
    val active = s.primaryDeviceId.isBlank() || s.primaryDeviceId == repo.deviceId
    if (active != hubActive) {
      Log.w(
        TAG,
        if (active) "hub ownership regained — resuming"
        else "primary hub is ${s.primaryDeviceId.take(8)} — pausing (no claims, BT released)",
      )
      hubActive = active
      lastError.set(if (active) null else "Ce terminal n'est plus le hub principal")
    }
    if (s.laneMode != settings.laneMode) {
      reconfigureLanes(s.laneMode)
    }
    settings = s
    ensureEagerLanes()
  }

  private fun netLoop() {
    var lastStaleCheck = 0L
    var lastClaimAttemptMs = 0L
    var lastHubRefresh = System.currentTimeMillis()
    var nextCleanupAt = System.currentTimeMillis() + CLEANUP_FIRST_DELAY_MS
    while (running.get()) {
      try {
        drainAcks()
        val now = System.currentTimeMillis()
        if (now - lastHubRefresh >= HUB_STATE_REFRESH_MS) {
          lastHubRefresh = now
          refreshHubState()
        }
        if (now - lastStaleCheck > 15_000L) {
          lastStaleCheck = now
          try {
            repo.reclaimStalePrinting(heldJobIds.toSet())
          } catch (e: Exception) {
            Log.w(TAG, "stale reclaim failed", e)
          }
        }
        if (now >= nextCleanupAt) {
          nextCleanupAt = now + CLEANUP_INTERVAL_MS
          repo.cleanupOldJobs()
        }

        val woke = wake.compareAndSet(true, false)
        val queuesEmpty = localQueue.isEmpty() && btDepth() == 0
        val idleDue = queuesEmpty && (now - lastClaimAttemptMs >= POLL_IDLE_MS)
        if (hubActive && (woke || idleDue)) {
          lastClaimAttemptMs = now
          val t0 = System.currentTimeMillis()
          val batch = try {
            repo.claimBatch()
          } catch (e: Exception) {
            Log.w(TAG, "claimBatch failed", e)
            lastError.set(e.message)
            emptyList()
          }
          // A row we already hold (queued or in flight) must not be printed twice,
          // even if something reset it to pending behind our back.
          val fresh = batch.filter { heldJobIds.add(it.id) }
          if (fresh.size < batch.size) {
            Log.w(TAG, "claim returned ${batch.size - fresh.size} already-held job(s) — skipped")
          }
          if (fresh.isNotEmpty()) {
            dispatch(fresh)
            Log.i(
              TAG,
              "net claim · batch=${batch.size} added=${fresh.size} usb=${localQueue.depth()} " +
                "bt=${btDepth()} lanes=${lanes.size} claim_ms=${System.currentTimeMillis() - t0}",
            )
            wake.set(true)
          }
        }

        onStatus(true, localQueue.depth() + btDepth(), lastError.get())
        sleepInterruptible(if (localQueue.isEmpty() && btDepth() == 0) POLL_IDLE_MS else 50L)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      } catch (e: Exception) {
        Log.e(TAG, "net loop error", e)
        lastError.set(e.message)
        sleepInterruptible(1000)
      }
    }
  }

  private fun drainAcks() {
    while (true) {
      val ack = ackQueue.poll() ?: break
      val lag = System.currentTimeMillis() - ack.finishedAt
      try {
        when (ack) {
          is PrintAck.Done -> {
            if (!repo.markDone(ack.job.id)) {
              Log.w(TAG, "ack done · ${ack.job.id.take(8)} · row no longer printing/pending")
            }
            heldJobIds.remove(ack.job.id)
            Log.i(TAG, "ack done · ${ack.job.id.take(8)} · ack_lag_ms=$lag")
            if (ack.job.jobType != "receipt") {
              val fps = ack.job.fingerprints
              val tableId = ack.job.tableId
              if (fps != null && !tableId.isNullOrBlank()) {
                repo.markKitchenItemsPrinted(tableId, fps)
              }
            }
            lastError.set(null)
          }
          is PrintAck.Fail -> {
            val nextAttempt = ack.job.attemptCount + 1
            val backoff = ack.backoffMs
              ?: if (ack.job.jobType == "receipt") PrintJobRepository.RECEIPT_RETRY_BACKOFF_MS
              else PrintJobRepository.RETRY_BACKOFF_MS
            repo.scheduleRetry(ack.job.id, nextAttempt, ack.message, backoff)
            heldJobIds.remove(ack.job.id)
            lastError.set(ack.message)
            Log.i(TAG, "ack fail · ${ack.job.id.take(8)} · ack_lag_ms=$lag")
          }
          is PrintAck.BadPayload -> {
            repo.scheduleRetry(ack.job.id, 99, ack.message, 0)
            heldJobIds.remove(ack.job.id)
            lastError.set(ack.message)
          }
          is PrintAck.Reroute -> handleReroute(ack)
        }
      } catch (e: Exception) {
        Log.e(TAG, "ack processing failed", e)
        lastError.set(e.message)
        // Retry every ack type next tick — rows stay `printing` + held meanwhile.
        ackQueue.offer(ack)
        break
      }
    }
  }

  private fun handleReroute(ack: PrintAck.Reroute) {
    val job = ack.job
    val target = if (settings.autoReroute && !job.isConsol) pickRerouteTarget(job) else null
    val escpos = target?.let { rerouteEscPos(job, it) }
    if (target != null && escpos != null && repo.rerouteKitchenJob(job, target, escpos, ack.reason)) {
      heldJobIds.remove(job.id)
      lastError.set("${job.printerName ?: "Cuisine"} hors ligne — basculé vers ${target.name}")
      Log.w(TAG, "REROUTE · ${job.id.take(8)} · ${job.printerName} → ${target.name} · ${ack.reason}")
      wake()
      return
    }
    // No healthy sibling / insert failed — normal retry, after the open window.
    val mac = job.macAddress
    val backoff = maxOf(
      mac?.let { breakers[PrinterLinkStatusHub.normalizeMac(it)]?.remainingOpenMs() } ?: 0L,
      PrintJobRepository.RETRY_BACKOFF_MS,
    )
    repo.scheduleRetry(job.id, job.attemptCount + 1, ack.reason, backoff)
    heldJobIds.remove(job.id)
    lastError.set(ack.reason)
  }

  // ── USB thread (unchanged behaviour) ────────────────────────────────────────

  private fun usbLoop() {
    while (running.get()) {
      try {
        if (!localQueue.hasUsbWork()) {
          drainAdminUsbOps()
        }
        usbPrinter.closeIfKeepaliveExpired()

        val job = localQueue.takeUsb()
        if (job == null) {
          drainAdminUsbOps()
          onStatus(true, localQueue.depth() + btDepth(), lastError.get())
          sleepInterruptible(POLL_IDLE_MS)
          continue
        }

        onStatus(true, localQueue.depth() + btDepth() + 1, lastError.get())
        processUsbJob(job)
        if (!localQueue.hasUsbWork()) {
          sleepInterruptible(0)
        }
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      } catch (e: Exception) {
        Log.e(TAG, "usb loop error", e)
        lastError.set(e.message)
        sleepInterruptible(500)
      }
    }
  }

  private fun processUsbJob(job: NativePrintJob) {
    val name = job.printerName ?: "imprimante"
    val vid = job.usbVendorId
    val pid = job.usbProductId
    val b64 = job.escposBase64
    Log.i(TAG, "USB PRINT START · ${job.jobType} → $name · queue_depth=${localQueue.depth()}")

    if (vid == null || pid == null || b64.isNullOrBlank()) {
      ackQueue.offer(
        PrintAck.BadPayload(job, "Payload ou USB vendor/product manquant", System.currentTimeMillis()),
      )
      wake()
      return
    }

    try {
      val timing = usbPrinter.sendEscPos(name, vid, pid, b64)
      ackQueue.offer(PrintAck.Done(job, System.currentTimeMillis()))
      wake()
      Log.i(
        TAG,
        "USB PRINT END OK · $name · reuse=${timing.reused} · " +
          "connect=${timing.connectMs} write=${timing.writeMs}",
      )
    } catch (e: Exception) {
      val msg = e.message ?: "Erreur impression USB"
      Log.e(TAG, "USB PRINT FAIL · $name · $msg", e)
      lastError.set(msg)
      try {
        usbPrinter.forceClose("job-fail:$name")
      } catch (_: Exception) {
        /* ignore */
      }
      ackQueue.offer(PrintAck.Fail(job, msg, System.currentTimeMillis()))
      wake()
    }
  }

  private fun sleepInterruptible(ms: Long) {
    if (ms <= 0L) return
    var left = ms
    while (left > 0L && running.get()) {
      if (wake.get()) return
      val slice = minOf(WAKE_SLICE_MS, left)
      try {
        Thread.sleep(slice)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        return
      }
      left -= slice
    }
  }
}
