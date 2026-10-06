/**
 * Shared Bluetooth reachability probes for Admin UI + hub auto-check on open.
 * Probes go through bluetoothCoordinator — deferred while print_jobs busy.
 */

import { drainDeferredProbes, onCoordinatorIdle } from "@/lib/bluetoothCoordinator";
import { hasActivePrintJobs } from "@/lib/kitchenPrintQueue";
import { printerService } from "@/lib/printerService";
import { getPrintersFromStore, type Printer } from "@/lib/printerStore";

export type PrinterReachability = {
  status: "unknown" | "checking" | "ok" | "fail" | "busy";
  detail: string;
};

let reachability: Record<string, PrinterReachability> = {};
const listeners = new Set<() => void>();
let probing = false;
let lastAutoProbeAt = 0;
/** Printers waiting because production queue was busy. */
let deferredProbePrinters: Printer[] = [];
let deferredRetryTimer: ReturnType<typeof setTimeout> | null = null;
let unsubIdle: (() => void) | null = null;

function emit() {
  for (const l of listeners) l();
}

export function getPrinterReachability(): Record<string, PrinterReachability> {
  return reachability;
}

export function isProbingAllPrinters(): boolean {
  return probing;
}

export function subscribePrinterReachability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setOne(id: string, value: PrinterReachability) {
  reachability = { ...reachability, [id]: value };
  emit();
}

/** Turn Bluetooth on if the plugin supports it (Android). */
export async function ensureBluetoothEnabled(): Promise<boolean> {
  if (typeof window === "undefined" || !window.bluetoothSerial) return false;
  const bs = window.bluetoothSerial;

  const enabled = await new Promise<boolean>((resolve) => {
    bs.isEnabled(
      () => resolve(true),
      () => resolve(false),
    );
  });
  if (enabled) return true;

  if (typeof bs.enable !== "function") {
    console.warn("[BT PROBE] Bluetooth off and enable() unavailable");
    return false;
  }

  console.log("[BT PROBE] Enabling Bluetooth…");
  return new Promise((resolve) => {
    bs.enable(
      () => {
        console.log("[BT PROBE] Bluetooth enabled");
        resolve(true);
      },
      (err: unknown) => {
        console.warn("[BT PROBE] enable failed", err);
        resolve(false);
      },
    );
  });
}

export async function probeOnePrinter(printer: Printer): Promise<{
  ok: boolean;
  detail: string;
}> {
  setOne(printer.id, { status: "checking", detail: "Test en cours…" });
  const result = await printerService.verifyPrinterReachable(printer);
  const busy =
    !result.ok && /occupée|occupee|en cours|file|busy/i.test(result.detail);
  setOne(printer.id, {
    status: result.ok ? "ok" : busy ? "busy" : "fail",
    detail: result.detail,
  });
  return result;
}

function markPrintersBusy(printers: Printer[]): void {
  for (const p of printers) {
    setOne(p.id, {
      status: "busy",
      detail: "File d'impression active — probe différé",
    });
  }
}

function scheduleDeferredProbeRetry(): void {
  if (deferredRetryTimer) return;
  deferredRetryTimer = setTimeout(() => {
    deferredRetryTimer = null;
    if (deferredProbePrinters.length === 0) return;
    console.log("[BT PROBE] retry deferred probes");
    void probeAllPrinters({
      skipIfBusyQueue: true,
      forceDeferIfQueueBusy: true,
      _fromDeferred: true,
    });
  }, 30_000);

  if (!unsubIdle) {
    unsubIdle = onCoordinatorIdle(() => {
      if (deferredProbePrinters.length === 0) return;
      drainDeferredProbes();
      void probeAllPrinters({
        skipIfBusyQueue: true,
        forceDeferIfQueueBusy: true,
        _fromDeferred: true,
      });
    });
  }
}

export async function probeAllPrinters(options?: {
  /** Only enabled printers (default true). */
  enabledOnly?: boolean;
  /** When true, skip/defer if queue has pending/printing jobs. */
  skipIfBusyQueue?: boolean;
  /** When true, mark busy + retry later instead of silent skip. */
  forceDeferIfQueueBusy?: boolean;
  /** @internal */
  _fromDeferred?: boolean;
}): Promise<void> {
  if (probing) {
    console.log("[BT PROBE] already running — skip");
    return;
  }

  const enabledOnly = options?.enabledOnly !== false;
  const candidates = getPrintersFromStore().filter(
    (p) =>
      (!enabledOnly || p.enabled) && (p.mac_address ?? "").trim() !== "",
  );

  if (options?.skipIfBusyQueue !== false && (await hasActivePrintJobs())) {
    console.log("[BT PROBE] defer — print_jobs pending/printing");
    if (options?.forceDeferIfQueueBusy !== false) {
      markPrintersBusy(candidates);
      // Merge into deferred list
      const byId = new Map(deferredProbePrinters.map((p) => [p.id, p]));
      for (const p of candidates) byId.set(p.id, p);
      deferredProbePrinters = [...byId.values()];
      scheduleDeferredProbeRetry();
      drainDeferredProbes();
    }
    return;
  }

  probing = true;
  emit();
  try {
    await ensureBluetoothEnabled();
    const printers = options?._fromDeferred
      ? deferredProbePrinters.splice(0, deferredProbePrinters.length)
      : candidates;
    if (printers.length === 0) {
      console.log("[BT PROBE] nothing to probe");
      return;
    }
    console.log("[BT PROBE] start", { count: printers.length });
    for (const p of printers) {
      // Re-check between printers — production may have started
      if (await hasActivePrintJobs()) {
        console.log("[BT PROBE] pause mid-run — queue busy");
        const remaining = printers.slice(printers.indexOf(p));
        markPrintersBusy(remaining);
        const byId = new Map(deferredProbePrinters.map((x) => [x.id, x]));
        for (const r of remaining) byId.set(r.id, r);
        deferredProbePrinters = [...byId.values()];
        scheduleDeferredProbeRetry();
        break;
      }
      await probeOnePrinter(p);
    }
    lastAutoProbeAt = Date.now();
    console.log("[BT PROBE] done");
  } finally {
    probing = false;
    emit();
  }
}

/**
 * Auto-run once per app session (or after cool-down) when this device is hub.
 * Never races production — defers when print_jobs busy.
 */
export function scheduleHubAutoBluetoothProbe(delayMs = 4000): () => void {
  let cancelled = false;
  const t = window.setTimeout(() => {
    if (cancelled) return;
    // Avoid hammering if Admin also mounts and triggers — 30s cool-down
    if (Date.now() - lastAutoProbeAt < 30_000) {
      console.log("[BT PROBE] skip auto — recent probe");
      return;
    }
    // Never steal radio during production burst — defer until queue idle
    void probeAllPrinters({
      skipIfBusyQueue: true,
      forceDeferIfQueueBusy: true,
      enabledOnly: true,
    });
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}
