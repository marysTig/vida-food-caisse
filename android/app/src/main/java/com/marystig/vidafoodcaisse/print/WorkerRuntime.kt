package com.marystig.vidafoodcaisse.print

/**
 * Process-wide handle so the Capacitor plugin can wake / query / admin-op
 * the running HubPrintWorkerService loop.
 */
object WorkerRuntime {
  @Volatile var loop: PrintWorkerLoop? = null
  @Volatile var running: Boolean = false
  @Volatile var queueDepth: Int = 0
  @Volatile var lastError: String? = null
}
