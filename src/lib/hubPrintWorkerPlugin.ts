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
  listUsbDevices(): Promise<{ devices: UsbDeviceInfo[] }>;
  adminProbe(options: {
    printerName: string;
    transport?: "bluetooth" | "usb";
    macAddress?: string;
    vendorId?: number;
    productId?: number;
  }): Promise<{ ok: boolean; detail: string }>;
  adminTestPrint(options: {
    printerName: string;
    transport?: "bluetooth" | "usb";
    macAddress?: string;
    vendorId?: number;
    productId?: number;
    escposBase64: string;
  }): Promise<{ ok: boolean; detail: string }>;
}

export type UsbDeviceInfo = {
  vendorId: number;
  productId: number;
  deviceName: string;
  productName: string | null;
  hasPermission: boolean;
};

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
  return HubPrintWorker.adminProbe({
    printerName,
    transport: "bluetooth",
    macAddress,
  });
}

export async function nativeAdminUsbProbe(
  printerName: string,
  vendorId: number,
  productId: number,
): Promise<{ ok: boolean; detail: string }> {
  return HubPrintWorker.adminProbe({
    printerName,
    transport: "usb",
    vendorId,
    productId,
  });
}

export async function nativeAdminTestPrint(
  printerName: string,
  macAddress: string,
  escposBase64: string,
): Promise<{ ok: boolean; detail: string }> {
  return HubPrintWorker.adminTestPrint({
    printerName,
    transport: "bluetooth",
    macAddress,
    escposBase64,
  });
}

export async function nativeAdminUsbTestPrint(
  printerName: string,
  vendorId: number,
  productId: number,
  escposBase64: string,
): Promise<{ ok: boolean; detail: string }> {
  return HubPrintWorker.adminTestPrint({
    printerName,
    transport: "usb",
    vendorId,
    productId,
    escposBase64,
  });
}

export async function nativeListUsbDevices(): Promise<UsbDeviceInfo[]> {
  if (!isNativePrintWorkerPlatform()) return [];
  try {
    const ret = await HubPrintWorker.listUsbDevices();
    return ret.devices ?? [];
  } catch (err) {
    console.warn("[HubPrintWorker] listUsbDevices failed", err);
    return [];
  }
}

export async function nativeTriggerManualRetry(): Promise<void> {
  await HubPrintWorker.triggerManualRetry();
}
