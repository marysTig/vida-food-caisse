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
 * Split radio / net drain:
 * - Radio thread: take local job → RFCOMM write → enqueue ack (no HTTP)
 * - Net thread: claimBatch RPC → local queue; drain acks → markDone / retry / fingerprints
 * Admin BT ops run on the radio thread via adminQueue.
 */
class PrintWorkerLoop(
  private val repo: PrintJobRepository,
  private val printer: EscPosBluetoothPrinter,
  private val onStatus: (running: Boolean, queueDepth: Int, lastError: String?) -> Unit,
) {
  companion object {
    private const val TAG = "PrintWorkerLoop"
    private const val POLL_IDLE_MS = 450L
    private const val RADIO_THREAD = "HubPrintRadio"
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
  private val adminQueue = LinkedBlockingQueue<() -> Unit>()

  private var radioExecutor: ExecutorService? = null
  private var netExecutor: ExecutorService? = null

  fun isRunning(): Boolean = running.get()

  fun getLastError(): String? = lastError.get()

  fun localQueueDepth(): Int = localQueue.depth()

  fun wake() {
    wake.set(true)
  }

  fun start() {
    if (!running.compareAndSet(false, true)) return
    printer.forceClose("loop-start")

    val radio = Executors.newSingleThreadExecutor { r ->
      Thread(r, RADIO_THREAD).apply { isDaemon = true }
    }
    val net = Executors.newSingleThreadExecutor { r ->
      Thread(r, NET_THREAD).apply { isDaemon = true }
    }
    radioExecutor = radio
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
    onStatus(true, 0, null)
    Log.i(TAG, "started · radio+net split")
  }

  fun stop() {
    running.set(false)
    wake.set(true)
    radioExecutor?.shutdownNow()
    netExecutor?.shutdownNow()
    radioExecutor = null
    netExecutor = null
    printer.forceClose("loop-stop")
    onStatus(false, 0, lastError.get())
    Log.i(TAG, "stopped")
  }

  fun triggerManualRetry() {
    // Net work — schedule on net executor
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

  /** Run Admin probe on the radio thread — never while production work is queued. */
  fun adminProbe(printerName: String, mac: String): Pair<Boolean, String> {
    return runOnRadioBlocking {
      try {
        if (localQueue.depth() > 0 || repo.countActiveJobs() > 0) {
          return@runOnRadioBlocking false to "File d'impression active — probe différé"
        }
        printer.probeConnect(printerName, mac)
        true to "Joignable (ping OK)"
      } catch (e: Exception) {
        false to (e.message ?: "Erreur probe")
      }
    }
  }

  fun adminTestPrint(printerName: String, mac: String, escposBase64: String): Pair<Boolean, String> {
    return runOnRadioBlocking {
      try {
        if (localQueue.depth() > 0) {
          return@runOnRadioBlocking false to "File d'impression active — test différé"
        }
        printer.sendEscPos(printerName, mac, escposBase64, isReceipt = true)
        true to "OK"
      } catch (e: Exception) {
        printer.hardSettle("admin-test-fail")
        false to (e.message ?: "Erreur impression test")
      }
    }
  }

  private fun runOnRadio(block: () -> Unit) {
    if (Thread.currentThread().name == RADIO_THREAD) {
      block()
      return
    }
    adminQueue.offer(block)
    wake()
  }

  private fun <T> runOnRadioBlocking(block: () -> T): T {
    if (Thread.currentThread().name == RADIO_THREAD) return block()
    val latch = CountDownLatch(1)
    val result = AtomicReference<Any?>()
    val error = AtomicReference<Exception?>()
    adminQueue.offer {
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

  private fun drainAdminOps() {
    while (true) {
      val op = adminQueue.poll() ?: break
      try {
        op()
      } catch (e: Exception) {
        Log.w(TAG, "admin op failed", e)
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

        // Claim only on wake OR idle interval when empty — never every tick (Logcat storm).
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
            wake.set(true) // nudge radio
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
            // Job stays in local kitchen front; release DB claim so reclaim is clean
            // if process dies — but keep printing status until re-taken would double-claim.
            // Local requeue already holds the job; leave status=printing until Done/Fail.
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
        // Re-offer once later
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
        // Production first: do not run admin probe while jobs are waiting (Logcat 17:47).
        if (localQueue.isEmpty()) {
          drainAdminOps()
        }
        printer.closeIfKeepaliveExpired()

        // Prefer receipts already in local queue (preempt kitchen start)
        var job = localQueue.take()
        if (job == null) {
          // Idle — drain deferred admin ops
          drainAdminOps()
          onStatus(true, 0, lastError.get())
          sleepInterruptible(POLL_IDLE_MS)
          continue
        }

        // If we took kitchen but a receipt arrived, put kitchen back and take receipt
        if (job.jobType != "receipt" && localQueue.hasReceipt()) {
          Log.i(TAG, "local preempt — receipt waiting, requeue kitchen ${job.id.take(8)}")
          localQueue.requeueKitchenFront(job)
          job = localQueue.take() ?: continue
        }

        onStatus(true, localQueue.depth() + 1, lastError.get())
        processRadioJob(job)
        // No busy poll when more work is local
        if (localQueue.isEmpty()) {
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

  private fun processRadioJob(job: NativePrintJob) {
    val name = job.printerName ?: "imprimante"
    val mac = job.macAddress
    val b64 = job.escposBase64
    val depth = localQueue.depth()
    Log.i(TAG, "PRINT START · ${job.jobType} → $name · queue_depth=$depth")

    if (mac.isNullOrBlank() || b64.isNullOrBlank()) {
      ackQueue.offer(Ack.BadPayload(job, "Payload ou MAC manquant", System.currentTimeMillis()))
      wake()
      return
    }

    val isReceipt = job.jobType == "receipt"

    // Kitchen: if receipt is already local, preempt before connect
    if (!isReceipt && localQueue.hasReceipt()) {
      Log.i(TAG, "receipt in local queue — requeue kitchen ${job.id.take(8)}")
      localQueue.requeueKitchenFront(job)
      if (printer.isRadioDirty() || printer.wasMidWrite()) {
        printer.hardSettle("receipt-preempt")
      }
      ackQueue.offer(Ack.Preempt(job, System.currentTimeMillis()))
      wake()
      return
    }

    try {
      val timing = printer.sendEscPos(name, mac, b64, isReceipt)
      // Mid-write receipt: check after write — next iteration will prefer receipt
      ackQueue.offer(Ack.Done(job, System.currentTimeMillis()))
      wake()
      Log.i(
        TAG,
        "PRINT END OK · $name · reuse=${timing.reused} · " +
          "gap=${timing.gapMs} settle=${timing.settleMs} " +
          "connect=${timing.connectMs} write=${timing.writeMs}",
      )
    } catch (e: Exception) {
      val msg = e.message ?: "Erreur impression"
      Log.e(TAG, "PRINT FAIL · $name · $msg", e)
      lastError.set(msg)
      try {
        printer.hardSettle("job-fail:$name")
      } catch (_: Exception) {
        /* ignore */
      }
      // If receipt arrived locally during fail, treat as preempt (no attempt++)
      if (!isReceipt && localQueue.hasReceipt()) {
        localQueue.requeueKitchenFront(job)
        ackQueue.offer(Ack.Preempt(job, System.currentTimeMillis()))
      } else {
        ackQueue.offer(Ack.Fail(job, msg, System.currentTimeMillis()))
      }
      wake()
    }
  }

  private fun sleepInterruptible(ms: Long) {
    if (ms <= 0L) {
      if (wake.compareAndSet(true, false)) return
      return
    }
    val end = System.currentTimeMillis() + ms
    while (running.get() && System.currentTimeMillis() < end) {
      if (wake.compareAndSet(true, false)) return
      try {
        Thread.sleep(50)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        return
      }
    }
  }
}
