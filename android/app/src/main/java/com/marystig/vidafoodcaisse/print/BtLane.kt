package com.marystig.vidafoodcaisse.print

import android.util.Log
import java.io.IOException
import java.util.ArrayDeque
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Outcome of a print attempt, persisted by the net thread. */
sealed class PrintAck {
  abstract val job: NativePrintJob
  abstract val finishedAt: Long

  data class Done(override val job: NativePrintJob, override val finishedAt: Long) : PrintAck()

  data class Fail(
    override val job: NativePrintJob,
    val message: String,
    override val finishedAt: Long,
    /** Overrides the default retry backoff (e.g. remaining circuit-open window). */
    val backoffMs: Long? = null,
  ) : PrintAck()

  data class BadPayload(
    override val job: NativePrintJob,
    val message: String,
    override val finishedAt: Long,
  ) : PrintAck()

  /** Kitchen job whose printer is down — net thread reroutes to a sibling kitchen. */
  data class Reroute(
    override val job: NativePrintJob,
    val reason: String,
    override val finishedAt: Long,
  ) : PrintAck()
}

/**
 * One Bluetooth print lane: its own thread, queue and [EscPosBluetoothPrinter].
 *
 * - parallel mode: one lane per kitchen MAC, persistent RFCOMM session kept warm
 *   by idle liveness pings (status-capable printers) and backoff reconnects.
 * - serialized mode: a single lane for every BT MAC (legacy one-radio behaviour,
 *   MAC handoff + 20s keepalive) — the safety fallback.
 *
 * Receipts are always taken before kitchen jobs. Admin ops run only when the
 * production queue is empty.
 */
class BtLane(
  val key: String,
  initialPrinterName: String,
  private val printer: EscPosBluetoothPrinter,
  val parallel: Boolean,
  private val breakerFor: (mac: String, name: String) -> PrinterCircuitBreaker,
  private val canReroute: (NativePrintJob) -> Boolean,
  /** False while this device is not the primary hub — no proactive connects. */
  private val isActive: () -> Boolean,
  private val ack: (PrintAck) -> Unit,
) {
  companion object {
    private const val TAG = "BtLane"
    private const val IDLE_POLL_MS = 1_000L
    /** Idle liveness ping cadence for persistent sessions. */
    const val PING_INTERVAL_MS = 15_000L
    private const val RECONNECT_BASE_MS = 15_000L
    private const val RECONNECT_MAX_MS = 300_000L
  }

  private class AdminOp(val block: () -> Unit)

  @Volatile var printerName: String = initialPrinterName

  private val lock = ReentrantLock()
  private val notEmpty = lock.newCondition()
  private val receipts = ArrayDeque<NativePrintJob>()
  private val kitchen = ArrayDeque<NativePrintJob>()
  private val adminOps = ArrayDeque<AdminOp>()

  @Volatile private var running = false
  @Volatile private var busy = false
  private var thread: Thread? = null

  private var nextReconnectAt = 0L
  private var reconnectBackoff = RECONNECT_BASE_MS

  fun start() {
    if (running) return
    running = true
    printer.forceClose("lane-start")
    thread = Thread({ loop() }, "HubPrintBt-${key.takeLast(5)}").apply {
      isDaemon = true
      start()
    }
    Log.i(TAG, "lane start · $key · ${if (parallel) "parallel" else "serialized"}")
  }

  /**
   * Stops the lane after its current job (bounded by the printer IO deadline)
   * and returns the jobs still queued so they can be re-offered elsewhere.
   */
  fun stop(joinMs: Long): List<NativePrintJob> {
    running = false
    lock.withLock { notEmpty.signalAll() }
    try {
      thread?.join(joinMs)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    if (thread?.isAlive == true) Log.w(TAG, "lane $key did not stop within ${joinMs}ms")
    thread = null
    printer.shutdown("lane-stop")
    return lock.withLock {
      val left = ArrayList<NativePrintJob>(receipts.size + kitchen.size)
      left.addAll(receipts)
      left.addAll(kitchen)
      receipts.clear()
      kitchen.clear()
      left
    }
  }

  fun offer(job: NativePrintJob) = lock.withLock {
    if (job.jobType == "receipt") receipts.addLast(job) else kitchen.addLast(job)
    notEmpty.signal()
  }

  fun depth(): Int = lock.withLock { receipts.size + kitchen.size }

  fun hasWork(): Boolean = busy || depth() > 0

  /** Runs [block] on the lane thread once production work is drained. */
  fun <T> runAdminBlocking(timeoutMs: Long, block: () -> T): T {
    if (Thread.currentThread() === thread) return block()
    val latch = CountDownLatch(1)
    val result = AtomicReference<Any?>()
    val error = AtomicReference<Exception?>()
    lock.withLock {
      adminOps.addLast(
        AdminOp {
          try {
            result.set(block())
          } catch (e: Exception) {
            error.set(e)
          } finally {
            latch.countDown()
          }
        },
      )
      notEmpty.signal()
    }
    if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
      throw IOException("Opération admin BT expirée — imprimante occupée")
    }
    error.get()?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return result.get() as T
  }

  /** Admin reachability check; parallel lanes keep the session open afterwards. */
  fun adminProbe(name: String, mac: String) {
    if (parallel) {
      printerName = name
      printer.ensureConnected(name, mac)
      breakerFor(mac, name).reset()
      nextReconnectAt = 0L
      reconnectBackoff = RECONNECT_BASE_MS
    } else {
      printer.probeConnect(name, mac)
      breakerFor(mac, name).reset()
    }
  }

  fun adminTestPrint(name: String, mac: String, escposBase64: String) {
    try {
      printer.sendEscPos(name, mac, escposBase64, isReceipt = true)
      breakerFor(mac, name).recordSuccess()
    } catch (e: Exception) {
      printer.hardSettle("admin-test-fail")
      throw e
    }
  }

  /** Next receipt, else kitchen job, else admin op; null after [timeoutMs] idle. */
  private fun next(timeoutMs: Long): Any? {
    lock.lock()
    try {
      var remaining = TimeUnit.MILLISECONDS.toNanos(timeoutMs)
      while (true) {
        receipts.pollFirst()?.let { return it }
        kitchen.pollFirst()?.let { return it }
        adminOps.pollFirst()?.let { return it }
        if (!running || remaining <= 0L) return null
        remaining = notEmpty.awaitNanos(remaining)
      }
    } finally {
      lock.unlock()
    }
  }

  private fun hasQueuedWork(): Boolean = lock.withLock {
    receipts.isNotEmpty() || kitchen.isNotEmpty()
  }

  private fun loop() {
    while (running) {
      try {
        if (!parallel) printer.closeIfKeepaliveExpired()
        when (val item = next(IDLE_POLL_MS)) {
          null -> if (parallel) idleMaintenance()
          is NativePrintJob -> {
            busy = true
            try {
              process(item)
            } finally {
              busy = false
            }
          }
          is AdminOp -> item.block()
        }
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      } catch (e: Exception) {
        Log.e(TAG, "lane $key loop error", e)
        try {
          Thread.sleep(500)
        } catch (_: InterruptedException) {
          break
        }
      }
    }
    Log.i(TAG, "lane stop · $key")
  }

  private fun process(job: NativePrintJob) {
    val name = job.printerName ?: "imprimante"
    val mac = job.macAddress
    val b64 = job.escposBase64
    if (mac.isNullOrBlank() || b64.isNullOrBlank()) {
      ack(PrintAck.BadPayload(job, "Payload ou MAC manquant", System.currentTimeMillis()))
      return
    }
    if (parallel) printerName = name
    val isReceipt = job.jobType == "receipt"
    val breaker = breakerFor(mac, name)

    // Fail fast: no ~9s connect stall while the printer is known down.
    if (breaker.blocksAttempt()) {
      val reason = "$name hors ligne (circuit ouvert)"
      Log.i(TAG, "BT SKIP · ${job.jobType} → $name · circuit open")
      if (!isReceipt && canReroute(job)) {
        ack(PrintAck.Reroute(job, reason, System.currentTimeMillis()))
      } else {
        val backoff = maxOf(breaker.remainingOpenMs(), PrintJobRepository.RETRY_BACKOFF_MS)
        ack(PrintAck.Fail(job, reason, System.currentTimeMillis(), backoff))
      }
      return
    }

    // Serialized lane only: release the ACL early when another MAC is waiting.
    val releaseForHandoff = !parallel && !isReceipt && hasQueuedWork()
    Log.i(TAG, "BT PRINT START · ${job.jobType} → $name · lane=$key · depth=${depth()}")
    try {
      val timing = printer.sendEscPos(name, mac, b64, isReceipt, releaseForHandoff)
      breaker.recordSuccess()
      nextReconnectAt = 0L
      reconnectBackoff = RECONNECT_BASE_MS
      ack(PrintAck.Done(job, System.currentTimeMillis()))
      Log.i(
        TAG,
        "BT PRINT END OK · $name · reuse=${timing.reused} · " +
          "gap=${timing.gapMs} settle=${timing.settleMs} " +
          "connect=${timing.connectMs} write=${timing.writeMs} confirm=${timing.confirm}" +
          if (releaseForHandoff) " · handoff" else "",
      )
    } catch (e: Exception) {
      val msg = e.message ?: "Erreur impression"
      Log.e(TAG, "BT PRINT FAIL · $name · $msg", e)
      try {
        printer.hardSettle("job-fail:$name")
      } catch (_: Exception) {
        /* ignore */
      }
      breaker.recordFailure(msg)
      if (!isReceipt && breaker.isOpen() && canReroute(job)) {
        ack(PrintAck.Reroute(job, msg, System.currentTimeMillis()))
      } else {
        ack(PrintAck.Fail(job, msg, System.currentTimeMillis()))
      }
    }
  }

  /**
   * Parallel lanes, idle only: ping the live session every [PING_INTERVAL_MS];
   * reconnect with exponential backoff when it is down so the next ticket does
   * not pay the connect. Failures feed the circuit breaker (fail-fast + reroute).
   */
  private fun idleMaintenance() {
    val mac = key
    if (!isActive()) {
      if (printer.hasLiveSession()) printer.forceClose("hub-inactive")
      return
    }
    val breaker = breakerFor(mac, printerName)
    if (printer.hasLiveSession()) {
      if (printer.liveIdleMs() >= PING_INTERVAL_MS && printer.pingLive(printerName) == false) {
        breaker.recordFailure("ping sans réponse")
        nextReconnectAt = 0L
      }
      printer.closeIfKeepaliveExpired()
      return
    }
    // Printers without status replies cannot be kept verified — connect on demand.
    if (printer.isStatusUnsupported(mac)) return
    val now = System.currentTimeMillis()
    if (now < nextReconnectAt || breaker.blocksAttempt()) return
    try {
      printer.ensureConnected(printerName, mac)
      breaker.recordSuccess()
      reconnectBackoff = RECONNECT_BASE_MS
      nextReconnectAt = 0L
    } catch (e: Exception) {
      Log.w(TAG, "warm reconnect failed · $printerName · ${e.message}")
      try {
        printer.forceClose("warm-fail:$printerName")
      } catch (_: Exception) {
        /* ignore */
      }
      breaker.recordFailure("reconnexion: ${e.message}")
      nextReconnectAt = now + reconnectBackoff
      reconnectBackoff = (reconnectBackoff * 2).coerceAtMost(RECONNECT_MAX_MS)
    }
  }
}
