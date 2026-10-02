/**
 * PrintQueueDaemon — single-flight Bluetooth drain for kitchen + receipt.
 * Receipt priority, 4s inter-MAC gap, 3× retry / 2.5s, auto-consol once.
 */

import { toast } from "sonner";
import {
  KitchenAbortedError,
  acquireKitchenRadio,
  acquireReceiptRadio,
  forceDisconnectNative,
  hardSettleRadio,
  markRadioNeedsSettle,
  nativeSendEscPos,
  sleep,
} from "@/lib/bluetoothRadio";
import { base64ToUint8 } from "@/lib/escposTickets";
import {
  claimNextPrintJob,
  enqueueConsolKitchenJob,
  hasPendingReceiptJob,
  markPrintJobDone,
  patchOrderKitchenFingerprints,
  reclaimStalePrintingJobs,
  requeueInterruptedJob,
  schedulePrintJobRetry,
  RECEIPT_RETRY_BACKOFF_MS,
  type PrintJob,
} from "@/lib/kitchenPrintQueue";
import { getPrintersFromStore } from "@/lib/printerStore";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import { isLocalDevicePrimaryHub } from "@/lib/printSettingsStore";
import { logPrintActivity, updatePrintActivity } from "@/lib/printActivityLog";
import { agentDebugLog } from "@/lib/agentDebugLog";

let lastSuccessMac: string | null = null;
let draining = false;
let currentKitchenJobId: string | null = null;
let kitchenAbort: AbortController | null = null;
let wakeDrain: (() => void) | null = null;
/** Ensures only one drain loop exists (React remount / hub flip). */
let stopActiveDaemon: (() => void) | null = null;

function notifyDrain() {
  wakeDrain?.();
}

/** Called when a new pending job arrives (realtime). */
export function wakePrintQueueDaemon() {
  notifyDrain();
  // If kitchen mid-print and receipt pending → abort kitchen for receipt priority
  void (async () => {
    if (!currentKitchenJobId || !kitchenAbort) return;
    if (await hasPendingReceiptJob()) {
      console.log("[PRINT DAEMON] Receipt pending — aborting kitchen job", currentKitchenJobId);
      markRadioNeedsSettle(`wake-abort:${currentKitchenJobId}`);
      kitchenAbort.abort();
    }
  })();
}

async function sendJobBytes(job: PrintJob, data: Uint8Array): Promise<"ok" | "aborted"> {
  const mac = (job.mac_address ?? "").trim();
  const name = job.printer_name ?? "imprimante";
  if (!mac) throw new Error("Adresse MAC manquante");

  if (job.job_type === "receipt") {
    const t0 = Date.now();
    // #region agent log
    agentDebugLog("printQueueDaemon.ts:sendJobBytes", "receipt_send_begin", { jobId: job.id, name, t: t0 }, "A");
    // #endregion
    const { release, didSettle } = await acquireReceiptRadio(
      `daemon-receipt:${job.id}`,
    );
    // #region agent log
    agentDebugLog(
      "printQueueDaemon.ts:sendJobBytes",
      "receipt_radio_acquired",
      { jobId: job.id, acquireMs: Date.now() - t0, didSettle },
      "B",
    );
    // #endregion
    try {
      const tSend = Date.now();
      try {
        await nativeSendEscPos({
          priority: "receipt",
          printerName: name,
          macAddress: mac,
          data,
          // Only skip pre-settle when acquire already hard-settled the radio.
          skipPreSettle: didSettle,
          skipPostSettle: true,
        });
      } catch (err) {
        // One local retry after hard settle — logcat c5a66150 needed 3 DB
        // attempts (~38s) when first connect hung with PRESETTLE_SKIP.
        console.warn(
          `[PRINT DAEMON] receipt connect fail, local retry after settle:`,
          err instanceof Error ? err.message : err,
        );
        // #region agent log
        agentDebugLog(
          "printQueueDaemon.ts:sendJobBytes",
          "receipt_local_retry",
          {
            jobId: job.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "H-caisse-settle",
        );
        // #endregion
        markRadioNeedsSettle("receipt-local-retry");
        await hardSettleRadio(`receipt-retry:${name}`);
        await nativeSendEscPos({
          priority: "receipt",
          printerName: name,
          macAddress: mac,
          data,
          skipPreSettle: true,
          skipPostSettle: true,
        });
      }
      // #region agent log
      agentDebugLog("printQueueDaemon.ts:sendJobBytes", "receipt_send_ok", { jobId: job.id, sendMs: Date.now() - tSend, totalMs: Date.now() - t0 }, "E");
      // #endregion
      lastSuccessMac = mac;
      return "ok";
    } finally {
      release();
    }
  }

  // Kitchen
  const ac = new AbortController();
  kitchenAbort = ac;
  currentKitchenJobId = job.id;

  let signal: AbortSignal;
  let release: () => void;
  try {
    const session = await acquireKitchenRadio(`daemon-kitchen:${job.id}`);
    signal = session.signal;
    release = session.release;
  } catch (err) {
    kitchenAbort = null;
    currentKitchenJobId = null;
    if (err instanceof KitchenAbortedError) return "aborted";
    throw err;
  }

  const combined = new AbortController();
  const forward = () => {
    if (!combined.signal.aborted) combined.abort();
    void forceDisconnectNative(`kitchen-abort:${name}`);
  };
  signal.addEventListener("abort", forward);
  ac.signal.addEventListener("abort", forward);

  try {
    if (await hasPendingReceiptJob()) {
      throw new KitchenAbortedError();
    }
    await nativeSendEscPos({
      priority: "kitchen",
      signal: combined.signal,
      printerName: name,
      macAddress: mac,
      data,
    });
    lastSuccessMac = mac;
    return "ok";
  } catch (err) {
    if (
      err instanceof KitchenAbortedError ||
      ac.signal.aborted ||
      combined.signal.aborted
    ) {
      return "aborted";
    }
    throw err;
  } finally {
    release();
    kitchenAbort = null;
    currentKitchenJobId = null;
    signal.removeEventListener("abort", forward);
    ac.signal.removeEventListener("abort", forward);
  }
}

async function tryAutoConsol(failedJob: PrintJob): Promise<void> {
  if (failedJob.job_type !== "kitchen") return;
  if (failedJob.payload.consolOfJobId) return; // already a consol copy

  const printers = getPrintersFromStore().filter(
    (p) => p.enabled && (p.type === "plaque" || p.type === "four") && p.mac_address,
  );
  const others = printers.filter((p) => p.id !== failedJob.printer_id);
  if (others.length === 0) return;

  // Prefer the other of plaque/four relative to failed printer
  const failedPrinter = printers.find((p) => p.id === failedJob.printer_id);
  const preferred =
    others.find((p) => failedPrinter && p.type !== failedPrinter.type) ?? others[0];
  if (!preferred) return;

  const result = await enqueueConsolKitchenJob({
    failedJob,
    targetPrinter: preferred,
  });
  if (result.status === "enqueued") {
    console.log(
      `[PRINT DAEMON] Auto-consol ${failedJob.printer_name} → ${preferred.name}`,
    );
    toast.warning(`Basculé vers ${preferred.name}`, {
      description: `${failedJob.printer_name ?? "Station"} indisponible`,
      duration: 5000,
    });
  }
}

async function processJob(job: PrintJob): Promise<void> {
  const b64 = job.payload?.escposBase64;
  if (!b64) {
    await schedulePrintJobRetry(job.id, MAX_ATTEMPTS_FORCE, "Payload ESC/POS manquant");
    return;
  }

  const data = base64ToUint8(b64);
  const activityId = logPrintActivity({
    kind: job.job_type === "receipt" ? "caisse" : "kitchen",
    printerName: job.printer_name ?? "?",
    mac: job.mac_address,
    status: "started",
    detail: `${job.job_type} · ${job.payload.orderLabel}`,
  });

  console.log(
    `[PRINT DAEMON] ${job.job_type} → ${job.printer_name} (attempt ${job.attempt_count + 1})`,
  );
  console.log(`[PRINT START] ${job.printer_name}`);
  // #region agent log
  if (job.job_type === "receipt") {
    agentDebugLog("printQueueDaemon.ts:processJob", "receipt_claimed", { jobId: job.id, printer: job.printer_name, attempt: job.attempt_count + 1 }, "A");
  }
  // #endregion

  try {
    const result = await sendJobBytes(job, data);
    if (result === "aborted") {
      updatePrintActivity(activityId, {
        status: "error",
        detail: "Interrompu (priorité caisse)",
      });
      await requeueInterruptedJob(job.id);
      console.log(`[PRINT DAEMON] Requeued interrupted kitchen ${job.id}`);
      // Back off while Admin probe / receipt holds exclusive radio — avoid denial spin
      await sleep(2000);
      return;
    }

    await markPrintJobDone(job.id);
    updatePrintActivity(activityId, { status: "success", detail: "OK" });

    if (job.job_type === "kitchen" && job.payload.fingerprints && job.payload.tableId) {
      await patchOrderKitchenFingerprints(
        job.payload.tableId,
        job.payload.fingerprints,
      );
    }
    console.log(`[PRINT END] ${job.printer_name}`);
    console.log(`[PRINT DAEMON] Done ${job.id}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PRINT DAEMON] Fail ${job.id}:`, message);
    updatePrintActivity(activityId, { status: "error", detail: message });
    try {
      await hardSettleRadio(`job-fail:${job.printer_name}`);
    } catch {
      /* ignore */
    }

    const nextAttempt = (job.attempt_count ?? 0) + 1;
    const backoff =
      job.job_type === "receipt" ? RECEIPT_RETRY_BACKOFF_MS : undefined;
    const outcome = await schedulePrintJobRetry(
      job.id,
      nextAttempt,
      message,
      backoff,
    );
    if (outcome === "needs_manual") {
      toast.error("Ticket non imprimé", {
        description: `${job.printer_name ?? "Imprimante"}: ${message}`,
        duration: 6000,
      });
      await tryAutoConsol(job);
    }
    console.log(`[PRINT END] ${job.printer_name}`);
  }
}

const MAX_ATTEMPTS_FORCE = 99;

/**
 * Single-flight drain loop. Call startPrintQueueDaemon once on primary hub.
 * Safe to call again — stops any previous loop first.
 */
export function startPrintQueueDaemon(): () => void {
  stopActiveDaemon?.();

  let stopped = false;
  let waitResolve: (() => void) | null = null;
  /** Set when wake arrives before waitForWake — prevents lost-wakeup (~1s caisse lag). */
  let pendingWake = false;

  wakeDrain = () => {
    pendingWake = true;
    if (waitResolve) {
      const resolve = waitResolve;
      waitResolve = null;
      pendingWake = false;
      resolve();
    }
  };

  const waitForWake = (ms: number) =>
    new Promise<void>((resolve) => {
      if (pendingWake) {
        pendingWake = false;
        resolve();
        return;
      }
      waitResolve = resolve;
      setTimeout(() => {
        if (waitResolve === resolve) {
          waitResolve = null;
          resolve();
        }
      }, ms);
    });

  const loop = async () => {
    console.log("[PRINT DAEMON] Started");
    while (!stopped) {
      if (!isLocalDevicePrimaryHub()) {
        // Poll frequently so the daemon wakes promptly once the printSettingsStore
        // finishes its async Supabase fetch and marks this device as primary hub.
        // A 3s sleep here caused up to ~3s delay on the first cashier receipt.
        await waitForWake(200);
        continue;
      }
      if (typeof window === "undefined" || !window.bluetoothSerial) {
        await waitForWake(5000);
        continue;
      }

      if (draining) {
        await waitForWake(200);
        continue;
      }

      draining = true;
      try {
        await reclaimStalePrintingJobs(getLocalPrintDeviceId());

        // Drain one job at a time (single-flight)
        // eslint-disable-next-line no-constant-condition
        while (!stopped && isLocalDevicePrimaryHub()) {
          const job = await claimNextPrintJob();
          if (!job) break;
          await processJob(job);
        }
      } catch (e) {
        console.error("[PRINT DAEMON] drain error", e);
      } finally {
        draining = false;
      }

      // Empty-queue poll. Wake + pendingWake make Encaisser instant; keep this
      // ≥1s so we do not hammer print_jobs claim (was 200ms → DB pressure).
      await waitForWake(1000);
    }
    console.log("[PRINT DAEMON] Stopped");
  };

  void loop();

  const stop = () => {
    stopped = true;
    if (stopActiveDaemon === stop) stopActiveDaemon = null;
    wakeDrain = null;
    waitResolve?.();
  };
  stopActiveDaemon = stop;
  return stop;
}
