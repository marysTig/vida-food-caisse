package com.marystig.vidafoodcaisse.print

import java.util.ArrayDeque
import java.util.HashSet
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * In-memory hot cache for the USB executor (Caisse receipts).
 * Bluetooth jobs live in per-printer [BtLane] queues.
 * Durable truth remains print_jobs.
 */
class LocalPrintQueue {
  private val lock = ReentrantLock()
  private val usbJobs = ArrayDeque<NativePrintJob>()
  private val ids = HashSet<String>()

  fun isEmpty(): Boolean = lock.withLock { usbJobs.isEmpty() }

  fun hasUsbWork(): Boolean = lock.withLock { usbJobs.isNotEmpty() }

  /** Offer claimed USB jobs; duplicates by id are ignored. */
  fun offerAll(jobs: List<NativePrintJob>): Int = lock.withLock {
    var added = 0
    for (job in jobs) {
      if (!ids.add(job.id)) continue
      usbJobs.addLast(job)
      added++
    }
    added
  }

  fun takeUsb(): NativePrintJob? = lock.withLock {
    val receipt = usbJobs.firstOrNull { it.jobType == "receipt" }
    val job = if (receipt != null) {
      usbJobs.remove(receipt)
      receipt
    } else {
      usbJobs.pollFirst()
    } ?: return@withLock null
    ids.remove(job.id)
    job
  }

  fun depth(): Int = lock.withLock { usbJobs.size }
}
