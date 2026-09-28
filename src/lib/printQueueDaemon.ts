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
  nativeSendEscPos,
  sleep,
} from "@/lib/bluetoothRadio";
import { base64ToUint8 } from "@/lib/escposTickets";
import {
  INTER_PRINTER_GAP_MS,
  RECEIPT_MAC_COOLDOWN_MS,
  claimNextPrintJob,
  enqueueConsolKitchenJob,
  hasPendingReceiptJob,
  markPrintJobDone,
  patchOrderKitchenFingerprints,
  reclaimStalePrintingJobs,
  requeueInterruptedJob,
  schedulePrintJobRetry,
  type PrintJob,
} from "@/lib/kitchenPrintQueue";
import { getPrintersFromStore } from "@/lib/printerStore";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import { isLocalDevicePrimaryHub } from "@/lib/printSettingsStore";
import { logPrintActivity, updatePrintActivity } from "@/lib/printActivityLog";

let lastSuccessMac: string | null = null;
let draining = false;
let currentKitchenJobId: string | null = null;
let kitchenAbort: AbortController | null = null;
let wakeDrain: (() => void) | null = null;

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
      kitchenAbort.abort();
    }
  })();
}

async function waitInterPrinterGap(nextMac: string, jobType?: string): Promise<number> {
  // Caisse: skip full 4s gap, but cool down briefly when switching MAC after kitchen
  if (jobType === "receipt") {
    if (lastSuccessMac && lastSuccessMac !== nextMac) {
      await sleep(RECEIPT_MAC_COOLDOWN_MS);
      return RECEIPT_MAC_COOLDOWN_MS;
    }
    return 0;
  }

  if (!lastSuccessMac || lastSuccessMac === nextMac) {
    return 0;
  }
  console.log(
    `[PRINT DAEMON] Inter-printer gap ${INTER_PRINTER_GAP_MS}ms (${lastSuccessMac} → ${nextMac})`,
  );

  // Interruptible: if a receipt arrives mid-gap, abort kitchen so caisse runs now
  const deadline = Date.now() + INTER_PRINTER_GAP_MS;
  while (Date.now() < deadline) {
    if (kitchenAbort?.signal.aborted || (await hasPendingReceiptJob())) {
      throw new KitchenAbortedError();
    }
    await sleep(Math.min(250, deadline - Date.now()));
  }
  return INTER_PRINTER_GAP_MS;
}

async function sendJobBytes(job: PrintJob, data: Uint8Array): Promise<"ok" | "aborted"> {
  const mac = (job.mac_address ?? "").trim();
  const name = job.printer_name ?? "imprimante";
  if (!mac) throw new Error("Adresse MAC manquante");

  try {
    await waitInterPrinterGap(mac, job.job_type);
  } catch (err) {
    if (err instanceof KitchenAbortedError) return "aborted";
    throw err;
  }

  if (job.job_type === "receipt") {
    const { release } = await acquireReceiptRadio(`daemon-receipt:${job.id}`);
    try {
      // Momentary caisse: skip trailing settle (acquire already settled once)
      await nativeSendEscPos({
        priority: "receipt",
        printerName: name,
        macAddress: mac,
        data,
        skipPreSettle: true,
        skipPostSettle: true,
      });
      lastSuccessMac = mac;
      return "ok";
    } finally {
      release();
      // No second hardSettle — native disconnect already closed the socket
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

  try {
    const result = await sendJobBytes(job, data);
    if (result === "aborted") {
      updatePrintActivity(activityId, {
        status: "error",
        detail: "Interrompu (priorité caisse)",
      });
      await requeueInterruptedJob(job.id);
      console.log(`[PRINT DAEMON] Requeued interrupted kitchen ${job.id}`);
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
    const outcome = await schedulePrintJobRetry(job.id, nextAttempt, message);
    if (outcome === "needs_manual") {
      toast.error("Ticket non imprimé", {
        description: `${job.printer_name ?? "Imprimante"}: ${message}`,
        duration: 6000,
      });
      await tryAutoConsol(job);
    }
  }
}

const MAX_ATTEMPTS_FORCE = 99;

/**
 * Single-flight drain loop. Call startPrintQueueDaemon once on primary hub.
 */
export function startPrintQueueDaemon(): () => void {
  let stopped = false;
  let waitResolve: (() => void) | null = null;

  wakeDrain = () => {
    waitResolve?.();
    waitResolve = null;
  };

  const waitForWake = (ms: number) =>
    new Promise<void>((resolve) => {
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
        await waitForWake(3000);
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

      await waitForWake(1500);
    }
    console.log("[PRINT DAEMON] Stopped");
  };

  void loop();

  return () => {
    stopped = true;
    wakeDrain = null;
    waitResolve?.();
  };
}
