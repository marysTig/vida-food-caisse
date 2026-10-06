package com.marystig.vidafoodcaisse.print

import android.util.Log
import java.io.IOException
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
 * - Radio thread: Kitchen (bluetooth) → EscPosBluetoothPrinter
 * - Net thread: claimBatch RPC → local queue; drain acks
 * Admin BT ops on radio thread; Admin USB ops on USB thread.
 */
class PrintWorkerLoop(
  private val repo: PrintJobRepository,
  private val btPrinter: EscPosBluetoothPrinter,
  private val usbPrinter: EscPosUsbPrinter,
  private val onStatus: (running: Boolean, queueDepth: Int, lastError: String?) -> Unit,
) {
  companion object {
    private const val TAG = "PrintWorkerLoop"
    private const val POLL_IDLE_MS = 800L
    /** Wake-responsive sleep slice — must be << POLL_IDLE so claimed jobs start immediately. */
    private const val WAKE_SLICE_MS = 50L
    private const val RADIO_THREAD = "HubPrintRadio"
    private const val USB_THREAD = "HubPrintUsb"
    private const val NET_THREAD = "HubPrintNet"
  }

  private sealed class Ack {
    data class Done(
      val job: NativePrintJob,
      val finishedAt: Long,
    ) : Ack()

    data class Fail(
      val job: NativePrintJob,
      val message: String,
      val finishedAt: Long,
    ) : Ack()

    data class Preempt(
      val job: NativePrintJob,
      val finishedAt: Long,
    ) : Ack()

    data class BadPayload(
      val job: NativePrintJob,
      val message: String,
      val finishedAt: Long,
    ) : Ack()
  }

  private val running = AtomicBoolean(false)
  private val wake = AtomicBoolean(false)
  private val lastError = AtomicReference<String?>(null)
  private val localQueue = LocalPrintQueue()
  private val ackQueue = LinkedBlockingQueue<Ack>()
  private val adminBtQueue = LinkedBlockingQueue<() -> Unit>()
  private val adminUsbQueue = LinkedBlockingQueue<() -> Unit>()

  private var radioExecutor: ExecutorService? = null
  private var usbExecutor: ExecutorService? = null
  private var netExecutor: ExecutorService? = null

  fun isRunning(): Boolean = running.get()

  fun getLastError(): String? = lastError.get()

  fun localQueueDepth(): Int = localQueue.depth()

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
    btPrinter.forceClose("loop-start")
    usbPrinter.forceClose("loop-start")

    val radio = Executors.newSingleThreadExecutor { r ->
      Thread(r, RADIO_THREAD).apply { isDaemon = true }
    }
    val usb = Executors.newSingleThreadExecutor { r ->
      Thread(r, USB_THREAD).apply { isDaemon = true }
    }
    val net = Executors.newSingleThreadExecutor { r ->
      Thread(r, NET_THREAD).apply { isDaemon = true }
    }
    radioExecutor = radio
    usbExecutor = usb
    netExecutor = net

    net.execute {
      try {
        repo.reclaimPrintingForDevice()
        onStatus(true, repo.countActiveJobs(), null)
      } catch (e: Exception) {
        Log.w(TAG, "startup reclaim failed", e)
      }
      netLoop()
    }
    radio.execute { radioLoop() }
    usb.execute { usbLoop() }
    onStatus(true, 0, null)
    Log.i(TAG, "started · usb+radio+net split")
  }

  fun stop() {
    running.set(false)
    wake.set(true)
    radioExecutor?.shutdownNow()
    usbExecutor?.shutdownNow()
    netExecutor?.shutdownNow()
    radioExecutor = null
    usbExecutor = null
    netExecutor = null
    btPrinter.forceClose("loop-stop")
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
    } ?: runOnRadio {
      try {
        val n = repo.retryAllNeedsManual()
        Log.i(TAG, "manual retry enqueued $n")
        wake()
      } catch (e: Exception) {
        lastError.set(e.message)
      }
    }
  }

  fun adminProbe(printerName: String, mac: String): Pair<Boolean, String> {
    return runOnRadioBlocking {
      try {
        // Never steal the radio during kitchen/receipt bursts — LEDs stay on lastOk TTL.
        if (localQueue.hasBtWork() || localQueue.hasUsbWork() || repo.countActiveJobs() > 0) {
          return@runOnRadioBlocking false to "File d'impression active — probe différé"
        }
        btPrinter.probeConnect(printerName, mac)
        true to "Joignable Bluetooth (ping OK)"
      } catch (e: Exception) {
        false to (e.message ?: "Erreur probe BT")
      }
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
    return runOnRadioBlocking {
      try {
        if (localQueue.hasBtWork()) {
          return@runOnRadioBlocking false to "File d'impression active — test différé"
        }
        btPrinter.sendEscPos(printerName, mac, escposBase64, isReceipt = true)
        true to "OK"
      } catch (e: Exception) {
        btPrinter.hardSettle("admin-test-fail")
        false to (e.message ?: "Erreur impression test BT")
      }
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

  private fun runOnRadio(block: () -> Unit) {
    if (Thread.currentThread().name == RADIO_THREAD) {
      block()
      return
    }
    adminBtQueue.offer(block)
    wake()
  }

  private fun runOnUsb(block: () -> Unit) {
    if (Thread.currentThread().name == USB_THREAD) {
      block()
      return
    }
    adminUsbQueue.offer(block)
    wake()
  }

  private fun <T> runOnRadioBlocking(block: () -> T): T {
    if (Thread.currentThread().name == RADIO_THREAD) return block()
    val latch = CountDownLatch(1)
    val result = AtomicReference<Any?>()
    val error = AtomicReference<Exception?>()
    adminBtQueue.offer {
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
      throw IOException("Admin BT op timeout — worker busy")
    }
    error.get()?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return result.get() as T
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

  private fun drainAdminBtOps() {
    while (true) {
      val op = adminBtQueue.poll() ?: break
      try {
        op()
      } catch (e: Exception) {
        Log.w(TAG, "admin BT op failed", e)
      }
    }
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

  private fun netLoop() {
    var lastStaleCheck = 0L
    var lastClaimAttemptMs = 0L
    while (running.get()) {
      try {
        drainAcks()
        val now = System.currentTimeMillis()
        if (now - lastStaleCheck > 15_000L) {
          lastStaleCheck = now
          try {
            repo.reclaimStalePrinting()
          } catch (e: Exception) {
            Log.w(TAG, "stale reclaim failed", e)
          }
        }

        val woke = wake.compareAndSet(true, false)
        val idleDue =
          localQueue.isEmpty() && (now - lastClaimAttemptMs >= POLL_IDLE_MS)
        if (woke || idleDue) {
          lastClaimAttemptMs = now
          val t0 = System.currentTimeMillis()
          val batch = try {
            repo.claimBatch()
          } catch (e: Exception) {
            Log.w(TAG, "claimBatch failed", e)
            lastError.set(e.message)
            emptyList()
          }
          if (batch.isNotEmpty()) {
            val added = localQueue.offerAll(batch)
            Log.i(
              TAG,
              "net claim · batch=${batch.size} added=$added local=${localQueue.depth()} " +
                "claim_ms=${System.currentTimeMillis() - t0}",
            )
            wake.set(true)
          }
        }

        onStatus(true, localQueue.depth(), lastError.get())
        sleepInterruptible(if (localQueue.isEmpty()) POLL_IDLE_MS else 50L)
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
      val lag = System.currentTimeMillis() - when (ack) {
        is Ack.Done -> ack.finishedAt
        is Ack.Fail -> ack.finishedAt
        is Ack.Preempt -> ack.finishedAt
        is Ack.BadPayload -> ack.finishedAt
      }
      try {
        when (ack) {
          is Ack.Done -> {
            repo.markDone(ack.job.id)
            Log.i(TAG, "ack done · ${ack.job.id.take(8)} · ack_lag_ms=$lag")
            if (ack.job.jobType != "receipt") {
              val fps = ack.job.fingerprints
              val tableId = ack.job.tableId
              if (fps != null && !tableId.isNullOrBlank()) {
                try {
                  repo.patchKitchenFingerprints(tableId, fps)
                } catch (e: Exception) {
                  Log.w(TAG, "fingerprint async failed", e)
                }
              }
            }
            lastError.set(null)
          }
          is Ack.Fail -> {
            val nextAttempt = ack.job.attemptCount + 1
            val backoff =
              if (ack.job.jobType == "receipt") PrintJobRepository.RECEIPT_RETRY_BACKOFF_MS
              else PrintJobRepository.RETRY_BACKOFF_MS
            repo.scheduleRetry(ack.job.id, nextAttempt, ack.message, backoff)
            Log.i(TAG, "ack fail · ${ack.job.id.take(8)} · ack_lag_ms=$lag")
          }
          is Ack.Preempt -> {
            Log.i(TAG, "ack preempt local · ${ack.job.id.take(8)} · ack_lag_ms=$lag")
          }
          is Ack.BadPayload -> {
            repo.scheduleRetry(ack.job.id, 99, ack.message, 0)
            lastError.set(ack.message)
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "ack processing failed", e)
        lastError.set(e.message)
        if (ack is Ack.Done) {
          ackQueue.offer(ack)
          break
        }
      }
    }
  }

  private fun radioLoop() {
    while (running.get()) {
      try {
        if (!localQueue.hasBtWork()) {
          drainAdminBtOps()
        }
        btPrinter.closeIfKeepaliveExpired()

        val job = localQueue.takeBluetooth()
        if (job == null) {
          drainAdminBtOps()
          onStatus(true, localQueue.depth(), lastError.get())
          sleepInterruptible(POLL_IDLE_MS)
          continue
        }

        onStatus(true, localQueue.depth() + 1, lastError.get())
        processBluetoothJob(job)
        if (!localQueue.hasBtWork()) {
          sleepInterruptible(0)
        }
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      } catch (e: Exception) {
        Log.e(TAG, "radio loop error", e)
        lastError.set(e.message)
        sleepInterruptible(500)
      }
    }
  }

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
          onStatus(true, localQueue.depth(), lastError.get())
          sleepInterruptible(POLL_IDLE_MS)
          continue
        }

        onStatus(true, localQueue.depth() + 1, lastError.get())
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
        Ack.BadPayload(job, "Payload ou USB vendor/product manquant", System.currentTimeMillis()),
      )
      wake()
      return
    }

    try {
      val timing = usbPrinter.sendEscPos(name, vid, pid, b64)
      ackQueue.offer(Ack.Done(job, System.currentTimeMillis()))
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
      ackQueue.offer(Ack.Fail(job, msg, System.currentTimeMillis()))
      wake()
    }
  }

  private fun processBluetoothJob(job: NativePrintJob) {
    val name = job.printerName ?: "imprimante"
    val mac = job.macAddress
    val b64 = job.escposBase64
    val depth = localQueue.depth()
    Log.i(TAG, "BT PRINT START · ${job.jobType} → $name · queue_depth=$depth")

    if (mac.isNullOrBlank() || b64.isNullOrBlank()) {
      ackQueue.offer(Ack.BadPayload(job, "Payload ou MAC manquant", System.currentTimeMillis()))
      wake()
      return
    }

    val isReceipt = job.jobType == "receipt"

    // Preempt BT kitchen only for BT receipts (USB receipts use the USB thread).
    if (!isReceipt && localQueue.hasBtReceipt()) {
      Log.i(TAG, "BT receipt waiting — requeue kitchen ${job.id.take(8)}")
      localQueue.requeueKitchenFront(job)
      if (btPrinter.isRadioDirty() || btPrinter.wasMidWrite()) {
        btPrinter.hardSettle("receipt-preempt")
      }
      ackQueue.offer(Ack.Preempt(job, System.currentTimeMillis()))
      wake()
      return
    }

    try {
      val timing = btPrinter.sendEscPos(name, mac, b64, isReceipt)
      ackQueue.offer(Ack.Done(job, System.currentTimeMillis()))
      wake()
      Log.i(
        TAG,
        "BT PRINT END OK · $name · reuse=${timing.reused} · " +
          "gap=${timing.gapMs} settle=${timing.settleMs} " +
          "connect=${timing.connectMs} write=${timing.writeMs}",
      )
    } catch (e: Exception) {
      val msg = e.message ?: "Erreur impression"
      Log.e(TAG, "BT PRINT FAIL · $name · $msg", e)
      lastError.set(msg)
      try {
        btPrinter.hardSettle("job-fail:$name")
      } catch (_: Exception) {
        /* ignore */
      }
      if (!isReceipt && localQueue.hasBtReceipt()) {
        localQueue.requeueKitchenFront(job)
        ackQueue.offer(Ack.Preempt(job, System.currentTimeMillis()))
      } else {
        ackQueue.offer(Ack.Fail(job, msg, System.currentTimeMillis()))
      }
      wake()
    }
  }

  private fun sleepInterruptible(ms: Long) {
    if (ms <= 0L) return
    // #region agent log
    if (ms >= 200L) {
      Log.i(
        "PrinterLinkDebug",
        """{"sessionId":"5eee2c","hypothesisId":"A","runId":"post-fix","location":"PrintWorkerLoop.sleep","message":"sleep-start","data":{"ms":$ms,"thread":"${Thread.currentThread().name}"},"timestamp":${System.currentTimeMillis()}}""",
      )
    }
    // #endregion
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
