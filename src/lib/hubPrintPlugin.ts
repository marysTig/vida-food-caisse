import { Capacitor, registerPlugin } from "@capacitor/core";

export interface HubPrintPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const HubPrint = registerPlugin<HubPrintPlugin>("HubPrint");

let lastShouldRun: boolean | null = null;

/**
 * Idempotent start/stop of the Android hub Foreground Service.
 * No-op on web / iOS; swallows native errors so POS never breaks.
 */
export async function syncHubForegroundService(shouldRun: boolean): Promise<void> {
  if (lastShouldRun === shouldRun) return;
  lastShouldRun = shouldRun;

  if (Capacitor.getPlatform() !== "android") return;

  try {
    if (shouldRun) {
      await HubPrint.start();
      console.log("[HubPrint] FGS started");
    } else {
      await HubPrint.stop();
      console.log("[HubPrint] FGS stopped");
    }
  } catch (err) {
    console.warn("[HubPrint] sync failed", err);
    // Allow retry on next sync
    lastShouldRun = null;
  }
}
