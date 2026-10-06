/**
 * @deprecated Phase 1 — use hubPrintWorkerPlugin.ts.
 * Kept so older imports resolve; forwards to native worker start/stop.
 */

import {
  startNativePrintWorker,
  stopNativePrintWorker,
} from "@/lib/hubPrintWorkerPlugin";

/**
 * Idempotent start/stop of the Android hub print worker (native FGS).
 */
export async function syncHubForegroundService(shouldRun: boolean): Promise<void> {
  try {
    if (shouldRun) {
      await startNativePrintWorker();
    } else {
      await stopNativePrintWorker();
    }
  } catch (err) {
    console.warn("[HubPrint] sync failed", err);
  }
}
