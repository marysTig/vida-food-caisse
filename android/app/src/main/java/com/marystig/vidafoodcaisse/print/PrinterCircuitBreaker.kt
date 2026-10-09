package com.marystig.vidafoodcaisse.print

import android.util.Log

/**
 * Per-MAC circuit breaker for Bluetooth printers.
 *
 * CLOSED → [FAILURE_THRESHOLD] consecutive failures → OPEN for an exponential
 * window (30s → 5min). While OPEN, kitchen jobs are not attempted (no ~9s connect
 * stall) and are rerouted / deferred. After the window one trial is allowed
 * (half-open); success closes the circuit, failure reopens with a longer window.
 */
class PrinterCircuitBreaker(
  private val mac: String,
  private val printerName: () -> String,
) {
  companion object {
    private const val TAG = "PrinterCircuit"
    const val FAILURE_THRESHOLD = 2
    const val OPEN_BASE_MS = 30_000L
    const val OPEN_MAX_MS = 300_000L
  }

  @Volatile private var consecutiveFailures = 0
  @Volatile private var openUntilMs = 0L
  @Volatile private var openWindowMs = 0L

  @Synchronized
  fun isOpen(): Boolean = openWindowMs > 0L

  /** True while open and the trial window has not elapsed yet. */
  @Synchronized
  fun blocksAttempt(): Boolean = openWindowMs > 0L && System.currentTimeMillis() < openUntilMs

  @Synchronized
  fun remainingOpenMs(): Long =
    if (openWindowMs == 0L) 0L else (openUntilMs - System.currentTimeMillis()).coerceAtLeast(0L)

  @Synchronized
  fun recordSuccess() {
    if (openWindowMs > 0L) Log.i(TAG, "CLOSE · ${printerName()} · $mac")
    consecutiveFailures = 0
    openWindowMs = 0L
    openUntilMs = 0L
    PrinterLinkStatusHub.setCircuitOpen(mac, false)
  }

  /** @return true when this failure opened (or re-opened) the circuit. */
  @Synchronized
  fun recordFailure(reason: String): Boolean {
    consecutiveFailures += 1
    val wasOpen = openWindowMs > 0L
    if (!wasOpen && consecutiveFailures < FAILURE_THRESHOLD) return false
    openWindowMs =
      if (wasOpen) (openWindowMs * 2).coerceAtMost(OPEN_MAX_MS) else OPEN_BASE_MS
    openUntilMs = System.currentTimeMillis() + openWindowMs
    Log.w(TAG, "OPEN ${openWindowMs / 1000}s · ${printerName()} · $mac · $reason")
    PrinterLinkStatusHub.setCircuitOpen(mac, true)
    return true
  }

  /** Manual reconnect (LED tap / admin) succeeded or was requested — reset. */
  @Synchronized
  fun reset() {
    recordSuccess()
  }
}
