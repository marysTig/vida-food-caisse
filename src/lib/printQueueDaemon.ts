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

async function sendJobBytes(job: PrintJob, data: Uint8Array): Promise<"ok" | "aborted"> {
  const mac = (job.mac_address ?? "").trim();
  const name = job.printer_name ?? "imprimante";
  if (!mac) throw new Error("Adresse MAC manquante");

  if (job.job_type === "receipt") {
    const t0 = Date.now();
    // #region agent log
    console.log(`[CAISSE LATENCY] send_begin · ${name} · job=${job.id}`);
    fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'caisse-latency',hypothesisId:'A',location:'printQueueDaemon.ts:sendJobBytes',message:'receipt_send_begin',data:{jobId:job.id,name,t:t0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const { release } = await acquireReceiptRadio(`daemon-receipt:${job.id}`);
    // #region agent log
    console.log(`[CAISSE LATENCY] radio_acquired · ${name} · acquireMs=${Date.now()-t0}`);
    fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'caisse-latency',hypothesisId:'B',location:'printQueueDaemon.ts:sendJobBytes',message:'receipt_radio_acquired',data:{jobId:job.id,acquireMs:Date.now()-t0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      // Momentary caisse: skip trailing settle (acquire already settled once)
      const tSend = Date.now();
      await nativeSendEscPos({
        priority: "receipt",
        printerName: name,
        macAddress: mac,
        data,
        skipPreSettle: true,
        skipPostSettle: true,
      });
      // #region agent log
      console.log(`[CAISSE LATENCY] send_ok · ${name} · sendMs=${Date.now()-tSend} · totalMs=${Date.now()-t0}`);
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'caisse-latency',hypothesisId:'E',location:'printQueueDaemon.ts:sendJobBytes',message:'receipt_send_ok',data:{jobId:job.id,sendMs:Date.now()-tSend,totalMs:Date.now()-t0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
  console.log(`[PRINT START] ${job.printer_name}`);
  // #region agent log
  if (job.job_type === "receipt") {
    console.log(`[CAISSE LATENCY] claimed · ${job.printer_name} · t=${Date.now()}`);
    fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'caisse-latency',hypothesisId:'A',location:'printQueueDaemon.ts:processJob',message:'receipt_claimed',data:{jobId:job.id,printer:job.printer_name,attempt:job.attempt_count+1,t:Date.now()},timestamp:Date.now()})}).catch(()=>{});
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
    const outcome = await schedulePrintJobRetry(job.id, nextAttempt, message);
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
 */
export function startPrintQueueDaemon(): () => void {
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

      // Short idle poll — wake + pendingWake handle instant enqueue; 1500ms was
      // amplifying lost-wakeup into ~1s caisse delay (logcat 21:43:16→17).
      await waitForWake(200);
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
