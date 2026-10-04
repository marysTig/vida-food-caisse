/**
 * Single entry-point for all Bluetooth SPP I/O (production + Admin).
 * Serializes ops, enforces MAC-switch cooldowns, defers probes while print_jobs busy.
 *
 * Callers outside this module must NOT import acquire*Radio / nativeSendEscPos /
 * nativeConnect for production paths — use the APIs below.
 */

import {
  KitchenAbortedError,
  acquireKitchenRadio,
  acquireProbeRadio,
  acquireReceiptRadio,
  forceDisconnectNative,
  hardSettleRadio,
  markRadioNeedsSettle,
  nativeConnect,
  nativeSendEscPos,
  sleep,
  touchIoProgress,
  BT_OP_TIMEOUT_MS,
} from "@/lib/bluetoothRadio";
import {
  INTER_PRINTER_GAP_MS,
  RECEIPT_MAC_COOLDOWN_MS,
  hasActivePrintJobs,
} from "@/lib/kitchenPrintQueue";
import type { Printer } from "@/lib/printerStore";

export type CoordJobType = "receipt" | "kitchen" | "probe" | "admin-test";

let lastSuccessMac: string | null = null;
/** Promise chain — at most one BT op runs at a time across daemon + Admin. */
let chain: Promise<unknown> = Promise.resolve();
let busy = false;

type DeferredProbe = {
  printer: Printer;
  resolve: (value: { ok: boolean; detail: string }) => void;
};

const probeDeferredQueue: DeferredProbe[] = [];
let drainProbesScheduled = false;

const idleListeners = new Set<() => void>();

export function getLastSuccessMac(): string | null {
  return lastSuccessMac;
}

export function isCoordinatorBusy(): boolean {
  return busy;
}

export function onCoordinatorIdle(listener: () => void): () => void {
  idleListeners.add(listener);
  return () => idleListeners.delete(listener);
}

function notifyIdle(): void {
  for (const l of idleListeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

async function applyMacSwitchCooldown(
  nextMac: string,
  jobType: CoordJobType,
): Promise<void> {
  const mac = nextMac.trim().toUpperCase();
  const prev = (lastSuccessMac ?? "").trim().toUpperCase();
  if (!prev || prev === mac) return;
  const gap =
    jobType === "receipt" || jobType === "admin-test"
      ? RECEIPT_MAC_COOLDOWN_MS
      : INTER_PRINTER_GAP_MS;
  console.log(
    `[BT COORD] MAC cooldown ${gap}ms · ${prev} → ${mac} · ${jobType}`,
  );
  touchIoProgress(`mac-cooldown:${jobType}`);
  await sleep(gap);
}

function enqueueExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    busy = true;
    console.log(`[BT COORD] BEGIN ${label}`);
    try {
      return await fn();
    } finally {
      busy = false;
      console.log(`[BT COORD] END ${label}`);
      notifyIdle();
      scheduleDeferredProbeDrain();
    }
  });
  // Keep chain alive even if a task rejects
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function runProductionReceipt(opts: {
  jobId: string;
  printerName: string;
  macAddress: string;
  data: Uint8Array;
}): Promise<void> {
  const mac = opts.macAddress.trim();
  if (!mac) throw new Error("Adresse MAC manquante");

  return enqueueExclusive(`receipt:${opts.jobId}`, async () => {
    const { release, didSettle } = await acquireReceiptRadio(
      `daemon-receipt:${opts.jobId}`,
    );
    try {
      await applyMacSwitchCooldown(mac, "receipt");
      try {
        await nativeSendEscPos({
          priority: "receipt",
          printerName: opts.printerName,
          macAddress: mac,
          data: opts.data,
          skipPreSettle: true,
          skipPostSettle: true,
        });
      } catch (err) {
        console.warn(
          `[BT COORD] receipt fail, local retry after settle:`,
          err instanceof Error ? err.message : err,
        );
        markRadioNeedsSettle("receipt-local-retry");
        await hardSettleRadio(`receipt-retry:${opts.printerName}`);
        await applyMacSwitchCooldown(mac, "receipt");
        await nativeSendEscPos({
          priority: "receipt",
          printerName: opts.printerName,
          macAddress: mac,
          data: opts.data,
          skipPreSettle: didSettle || true,
          skipPostSettle: true,
        });
      }
      lastSuccessMac = mac;
    } finally {
      release();
    }
  });
}

export async function runProductionKitchen(opts: {
  jobId: string;
  printerName: string;
  macAddress: string;
  data: Uint8Array;
  /** Daemon-local abort (receipt wake) */
  abortSignal: AbortSignal;
}): Promise<"ok" | "aborted"> {
  const mac = opts.macAddress.trim();
  if (!mac) throw new Error("Adresse MAC manquante");

  return enqueueExclusive(`kitchen:${opts.jobId}`, async () => {
    if (opts.abortSignal.aborted) return "aborted";

    let signal: AbortSignal;
    let release: (() => void) | null = null;
    try {
      const session = await acquireKitchenRadio(`daemon-kitchen:${opts.jobId}`);
      signal = session.signal;
      release = session.release;
    } catch (err) {
      if (err instanceof KitchenAbortedError) return "aborted";
      throw err;
    }

    const combined = new AbortController();
    const forward = () => {
      if (!combined.signal.aborted) combined.abort();
      void forceDisconnectNative(`kitchen-abort:${opts.printerName}`);
    };
    signal.addEventListener("abort", forward);
    opts.abortSignal.addEventListener("abort", forward);

    try {
      if (opts.abortSignal.aborted || signal.aborted) {
        return "aborted";
      }
      await applyMacSwitchCooldown(mac, "kitchen");
      if (opts.abortSignal.aborted || signal.aborted) {
        return "aborted";
      }
      await nativeSendEscPos({
        priority: "kitchen",
        signal: combined.signal,
        printerName: opts.printerName,
        macAddress: mac,
        data: opts.data,
      });
      lastSuccessMac = mac;
      return "ok";
    } catch (err) {
      if (
        err instanceof KitchenAbortedError ||
        opts.abortSignal.aborted ||
        combined.signal.aborted
      ) {
        return "aborted";
      }
      throw err;
    } finally {
      release?.();
      signal.removeEventListener("abort", forward);
      opts.abortSignal.removeEventListener("abort", forward);
    }
  });
}

export async function runAdminTestPrint(opts: {
  printer: Printer;
  data: Uint8Array;
}): Promise<void> {
  const mac = (opts.printer.mac_address ?? "").trim();
  if (!mac) {
    throw new Error("Adresse MAC non configurée pour " + opts.printer.name);
  }

  return enqueueExclusive(`admin-test:${opts.printer.name}`, async () => {
    const { release, didSettle } = await acquireReceiptRadio(
      `admin-test:${opts.printer.name}`,
    );
    try {
      await applyMacSwitchCooldown(mac, "admin-test");
      await nativeSendEscPos({
        priority: "receipt",
        printerName: opts.printer.name,
        macAddress: mac,
        data: opts.data,
        skipPreSettle: didSettle,
      });
      lastSuccessMac = mac;
    } finally {
      release();
    }
  });
}

async function executeProbeConnect(printer: Printer): Promise<{
  ok: boolean;
  detail: string;
}> {
  const mac = (printer.mac_address ?? "").trim();
  if (!mac) {
    return { ok: false, detail: "Adresse MAC manquante" };
  }

  let release: (() => void) | null = null;
  try {
    const session = await acquireProbeRadio(`probe:${printer.name}`);
    release = session.release;
    await applyMacSwitchCooldown(mac, "probe");
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        fn();
      };
      const t = setTimeout(() => {
        finish(() => {
          void (async () => {
            try {
              await hardSettleRadio(`probe-timeout:${printer.name}`);
            } catch {
              /* ignore */
            }
            reject(
              new Error(
                `Timeout ping Bluetooth (${BT_OP_TIMEOUT_MS / 1000}s)`,
              ),
            );
          })();
        });
      }, BT_OP_TIMEOUT_MS);

      window.bluetoothSerial.isEnabled(
        () => {
          touchIoProgress(`probe-connect:${printer.name}`);
          void nativeConnect(mac, `probe:${printer.name}`)
            .then(() => {
              touchIoProgress(`probe-ok:${printer.name}`);
              void hardSettleRadio(`probe-ok:${printer.name}`).then(() =>
                finish(() => resolve()),
              );
            })
            .catch((err: unknown) => {
              void hardSettleRadio(`probe-err:${printer.name}`).then(() =>
                finish(() =>
                  reject(new Error("Connexion impossible: " + String(err))),
                ),
              );
            });
        },
        () =>
          finish(() =>
            reject(new Error("Bluetooth désactivé sur la tablette")),
          ),
      );
    });
    lastSuccessMac = mac;
    return { ok: true, detail: "Joignable (ping OK)" };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, detail };
  } finally {
    release?.();
  }
}

/**
 * Probe connect. If production queue has pending/printing jobs, defer until idle.
 */
export async function runProbeConnect(printer: Printer): Promise<{
  ok: boolean;
  detail: string;
}> {
  if (typeof window === "undefined" || !window.bluetoothSerial) {
    return { ok: false, detail: "Bluetooth Serial non disponible" };
  }

  if (await hasActivePrintJobs()) {
    console.log(
      `[BT COORD] probe deferred (queue busy) · ${printer.name}`,
    );
    return new Promise((resolve) => {
      probeDeferredQueue.push({ printer, resolve });
      scheduleDeferredProbeDrain();
    });
  }

  return enqueueExclusive(`probe:${printer.name}`, () =>
    executeProbeConnect(printer),
  );
}

function scheduleDeferredProbeDrain(): void {
  if (drainProbesScheduled) return;
  drainProbesScheduled = true;
  void (async () => {
    try {
      // Small yield so production release completes
      await sleep(100);
      while (probeDeferredQueue.length > 0) {
        if (busy) {
          await sleep(200);
          continue;
        }
        if (await hasActivePrintJobs()) {
          await sleep(2000);
          continue;
        }
        const next = probeDeferredQueue.shift();
        if (!next) break;
        const result = await enqueueExclusive(
          `probe-deferred:${next.printer.name}`,
          () => executeProbeConnect(next.printer),
        );
        next.resolve(result);
      }
    } finally {
      drainProbesScheduled = false;
      if (probeDeferredQueue.length > 0) {
        scheduleDeferredProbeDrain();
      }
    }
  })();
}

/** Flush deferred probes when production queue is idle (idempotent). */
export function drainDeferredProbes(): void {
  scheduleDeferredProbeDrain();
}

export { KitchenAbortedError };
