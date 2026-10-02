/**
 * Shared Bluetooth reachability probes for Admin UI + hub auto-check on open.
 * Probes wait for idle radio (acquireProbeRadio) — never steal kitchen/receipt.
 */

import { printerService } from "@/lib/printerService";
import { getPrintersFromStore, type Printer } from "@/lib/printerStore";
import { supabase } from "@/lib/supabase";

export type PrinterReachability = {
  status: "unknown" | "checking" | "ok" | "fail" | "busy";
  detail: string;
};

let reachability: Record<string, PrinterReachability> = {};
const listeners = new Set<() => void>();
let probing = false;
let lastAutoProbeAt = 0;

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
    !result.ok && /occupée|occupee|en cours/i.test(result.detail);
  setOne(printer.id, {
    status: result.ok ? "ok" : busy ? "busy" : "fail",
    detail: result.detail,
  });
  return result;
}

/**
 * Probe all enabled printers with a MAC.
 * Safe to call on hub open — waits for idle radio between printers.
 */
async function hasActivePrintJobs(): Promise<boolean> {
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .in("status", ["pending", "printing"])
    .limit(1);
  return !!(data && data.length > 0);
}

export async function probeAllPrinters(options?: {
  /** Only enabled printers (default true). */
  enabledOnly?: boolean;
  /** When true, skip if queue has pending/printing jobs. */
  skipIfBusyQueue?: boolean;
}): Promise<void> {
  if (probing) {
    console.log("[BT PROBE] already running — skip");
    return;
  }
  if (options?.skipIfBusyQueue !== false && (await hasActivePrintJobs())) {
    console.log("[BT PROBE] skip — print_jobs pending/printing");
    return;
  }
  probing = true;
  emit();
  try {
    const enabledOnly = options?.enabledOnly !== false;
    await ensureBluetoothEnabled();
    const printers = getPrintersFromStore().filter(
      (p) =>
        (!enabledOnly || p.enabled) && (p.mac_address ?? "").trim() !== "",
    );
    console.log("[BT PROBE] start", { count: printers.length });
    for (const p of printers) {
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
    void probeAllPrinters({ skipIfBusyQueue: true });
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(t);
  };
}
