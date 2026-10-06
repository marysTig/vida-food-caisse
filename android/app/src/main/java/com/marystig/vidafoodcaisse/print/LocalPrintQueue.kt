package com.marystig.vidafoodcaisse.print

import java.util.ArrayDeque
import java.util.HashSet
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * In-memory hot cache for print executors.
 * USB receipts and Bluetooth kitchen can be taken in parallel by separate threads.
 * Durable truth remains print_jobs.
 */
class LocalPrintQueue {
  private val lock = ReentrantLock()
  private val usbJobs = ArrayDeque<NativePrintJob>()
  private val btJobs = ArrayDeque<NativePrintJob>()
  private val ids = HashSet<String>()

  fun size(): Int = lock.withLock { usbJobs.size + btJobs.size }

  fun isEmpty(): Boolean = lock.withLock { usbJobs.isEmpty() && btJobs.isEmpty() }

  fun hasUsbWork(): Boolean = lock.withLock { usbJobs.isNotEmpty() }

  fun hasBtWork(): Boolean = lock.withLock { btJobs.isNotEmpty() }

  fun hasBtReceipt(): Boolean = lock.withLock { btJobs.any { it.jobType == "receipt" } }

  /** Legacy helper — true if any USB receipt or BT receipt is queued. */
  fun hasReceipt(): Boolean = lock.withLock {
    usbJobs.any { it.jobType == "receipt" } || btJobs.any { it.jobType == "receipt" }
  }

  /** Offer claimed jobs; duplicates by id are ignored. */
  fun offerAll(jobs: List<NativePrintJob>): Int = lock.withLock {
    var added = 0
    for (job in jobs) {
      if (!ids.add(job.id)) continue
      if (job.isUsb) {
        usbJobs.addLast(job)
      } else {
        btJobs.addLast(job)
      }
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

  /** Prefer BT receipt, else BT kitchen. */
  fun takeBluetooth(): NativePrintJob? = lock.withLock {
    val receipt = btJobs.firstOrNull { it.jobType == "receipt" }
    val job = if (receipt != null) {
      btJobs.remove(receipt)
      receipt
    } else {
      btJobs.pollFirst()
    } ?: return@withLock null
    ids.remove(job.id)
    job
  }

  /** @deprecated Prefer takeUsb / takeBluetooth for parallel lanes. */
  fun take(): NativePrintJob? = lock.withLock {
    val job = usbJobs.pollFirst()
      ?: btJobs.firstOrNull { it.jobType == "receipt" }?.also { btJobs.remove(it) }
      ?: btJobs.pollFirst()
      ?: return@withLock null
    ids.remove(job.id)
    job
  }

  /** Requeue interrupted kitchen at front of BT lane. */
  fun requeueKitchenFront(job: NativePrintJob) = lock.withLock {
    if (!ids.add(job.id)) return@withLock
    if (job.isUsb) {
      usbJobs.addFirst(job)
    } else {
      btJobs.addFirst(job)
    }
  }

  fun depth(): Int = size()
}
