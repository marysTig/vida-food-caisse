package com.marystig.vidafoodcaisse.print

import java.util.ArrayDeque
import java.util.HashSet
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * In-memory hot cache for the radio thread.
 * Receipts always win over kitchen. Durable truth remains print_jobs.
 */
class LocalPrintQueue {
  private val lock = ReentrantLock()
  private val receipts = ArrayDeque<NativePrintJob>()
  private val kitchen = ArrayDeque<NativePrintJob>()
  private val ids = HashSet<String>()

  fun size(): Int = lock.withLock { receipts.size + kitchen.size }

  fun isEmpty(): Boolean = lock.withLock { receipts.isEmpty() && kitchen.isEmpty() }

  fun hasReceipt(): Boolean = lock.withLock { receipts.isNotEmpty() }

  /** Offer claimed jobs; duplicates by id are ignored. */
  fun offerAll(jobs: List<NativePrintJob>): Int = lock.withLock {
    var added = 0
    for (job in jobs) {
      if (!ids.add(job.id)) continue
      if (job.jobType == "receipt") {
        receipts.addLast(job)
      } else {
        kitchen.addLast(job)
      }
      added++
    }
    added
  }

  /** Prefer receipt, else kitchen. */
  fun take(): NativePrintJob? = lock.withLock {
    val job = receipts.pollFirst() ?: kitchen.pollFirst() ?: return@withLock null
    ids.remove(job.id)
    job
  }

  /** Requeue interrupted kitchen at front (no attempt++ — DB still printing until ack). */
  fun requeueKitchenFront(job: NativePrintJob) = lock.withLock {
    if (!ids.add(job.id)) return@withLock
    kitchen.addFirst(job)
  }

  fun depth(): Int = size()
}
