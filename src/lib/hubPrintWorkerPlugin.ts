/**
 * Capacitor bridge to the native HubPrintWorkerService (Phase 1).
 * When the worker is running, JS PrintQueueDaemon must not touch Bluetooth.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { getLocalPrintDeviceId } from "@/lib/printDevice";

export type HubPrintWorkerStatus = {
  running: boolean;
  lastError: string | null;
  queueDepth?: number;
  configured?: boolean;
};

export interface HubPrintWorkerPlugin {
  startWorker(options: {
    deviceId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
  }): Promise<{ running: boolean }>;
  stopWorker(): Promise<void>;
  getWorkerStatus(): Promise<HubPrintWorkerStatus>;
  triggerManualRetry(): Promise<void>;
  wakeWorker(): Promise<void>;
  adminProbe(options: {
    printerName: string;
    macAddress: string;
  }): Promise<{ ok: boolean; detail: string }>;
  adminTestPrint(options: {
    printerName: string;
    macAddress: string;
    escposBase64: string;
  }): Promise<{ ok: boolean; detail: string }>;
}

const HubPrintWorker = registerPlugin<HubPrintWorkerPlugin>("HubPrintWorker");

let nativeDrainActive = false;

export function isNativePrintWorkerActive(): boolean {
  return nativeDrainActive;
}

export function setNativePrintWorkerActive(active: boolean): void {
  nativeDrainActive = active;
  console.log(`[HubPrintWorker] nativeDrainActive=${active}`);
}

export function isNativePrintWorkerPlatform(): boolean {
  return Capacitor.getPlatform() === "android";
}

function supabaseCreds(): { url: string; anonKey: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  )?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Start native worker on Android hub. Returns true if native drain owns Bluetooth.
 */
export async function startNativePrintWorker(): Promise<boolean> {
  if (!isNativePrintWorkerPlatform()) {
    setNativePrintWorkerActive(false);
    return false;
  }
  const creds = supabaseCreds();
  if (!creds) {
    console.error("[HubPrintWorker] missing VITE_SUPABASE_* — cannot start");
    setNativePrintWorkerActive(false);
    return false;
  }
  try {
    await HubPrintWorker.startWorker({
      deviceId: getLocalPrintDeviceId(),
      supabaseUrl: creds.url,
      supabaseAnonKey: creds.anonKey,
    });
    // Confirm status after a brief settle
    const status = await HubPrintWorker.getWorkerStatus();
    const ok = !!status.running || !!status.configured;
    setNativePrintWorkerActive(ok);
    console.log("[HubPrintWorker] started", status);
    return ok;
  } catch (err) {
    console.warn("[HubPrintWorker] start failed — Phase 0 fallback", err);
    setNativePrintWorkerActive(false);
    return false;
  }
}

export async function stopNativePrintWorker(): Promise<void> {
  if (!isNativePrintWorkerPlatform()) return;
  try {
    await HubPrintWorker.stopWorker();
  } catch (err) {
    console.warn("[HubPrintWorker] stop failed", err);
  } finally {
    setNativePrintWorkerActive(false);
  }
}

export async function getNativePrintWorkerStatus(): Promise<HubPrintWorkerStatus> {
  if (!isNativePrintWorkerPlatform()) {
    return { running: false, lastError: null, queueDepth: 0 };
  }
  try {
    return await HubPrintWorker.getWorkerStatus();
  } catch {
    return { running: false, lastError: "plugin unavailable", queueDepth: 0 };
  }
}

export async function wakeNativePrintWorker(): Promise<void> {
  if (!nativeDrainActive || !isNativePrintWorkerPlatform()) return;
  try {
    await HubPrintWorker.wakeWorker();
  } catch {
    /* ignore */
  }
}

export async function nativeAdminProbe(
  printerName: string,
  macAddress: string,
): Promise<{ ok: boolean; detail: string }> {
  // #region agent log
  fetch("http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "5eee2c",
    },
    body: JSON.stringify({
      sessionId: "5eee2c",
      runId: "bt-connect-1",
      hypothesisId: "D",
      location: "hubPrintWorkerPlugin.ts:nativeAdminProbe",
      message: "adminProbe via native worker",
      data: {
        printerName,
        macAddress,
        nativeDrainActive,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const result = await HubPrintWorker.adminProbe({ printerName, macAddress });
  // #region agent log
  fetch("http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "5eee2c",
    },
    body: JSON.stringify({
      sessionId: "5eee2c",
      runId: "bt-connect-1",
      hypothesisId: "D",
      location: "hubPrintWorkerPlugin.ts:nativeAdminProbe:result",
      message: "adminProbe result",
      data: { ok: result.ok, detail: result.detail, nativeDrainActive },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return result;
}

export async function nativeAdminTestPrint(
  printerName: string,
  macAddress: string,
  escposBase64: string,
): Promise<{ ok: boolean; detail: string }> {
  return HubPrintWorker.adminTestPrint({
    printerName,
    macAddress,
    escposBase64,
  });
}

export async function nativeTriggerManualRetry(): Promise<void> {
  await HubPrintWorker.triggerManualRetry();
}
