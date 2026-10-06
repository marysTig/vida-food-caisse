import { useEffect, useRef } from "react";
import {
  startNativePrintWorker,
  stopNativePrintWorker,
  isNativePrintWorkerPlatform,
} from "@/lib/hubPrintWorkerPlugin";
import { usePrintSettingsStore } from "@/lib/printSettingsStore";

/**
 * Starts the native HubPrintWorkerService when this device is primary hub.
 * Stops only when hub role is lost (true → false), not on initial false
 * during settings load (avoids killing a sticky worker on race).
 */
export function HubForegroundSync() {
  const { isPrimaryHub, loading, primaryDeviceId } = usePrintSettingsStore();
  const wasHub = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isNativePrintWorkerPlatform()) return;

    console.log(
      `[HubForegroundSync] hub=${isPrimaryHub} primary=${primaryDeviceId || "(none)"} was=${wasHub.current}`,
    );

    if (isPrimaryHub) {
      void (async () => {
        const ok = await startNativePrintWorker();
        if (!ok) {
          console.warn(
            "[HubForegroundSync] Native worker failed — Phase 0 JS drain remains active",
          );
        }
      })();
    } else if (wasHub.current === true) {
      void stopNativePrintWorker();
    }

    wasHub.current = isPrimaryHub;
  }, [loading, isPrimaryHub, primaryDeviceId]);

  return null;
}
