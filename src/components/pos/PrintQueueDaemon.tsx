import { useEffect } from "react";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import {
  isLocalDevicePrimaryHub,
  usePrintSettingsStore,
} from "@/lib/printSettingsStore";
import {
  startPrintQueueDaemon,
  wakePrintQueueDaemon,
} from "@/lib/printQueueDaemon";

let _daemonManager: RealtimeManager | null = null;

export function getPrintQueueRealtimeManager(): RealtimeManager | null {
  return _daemonManager;
}

/** @deprecated alias for Admin / older imports */
export function getKitchenPrintRealtimeManager(): RealtimeManager | null {
  return _daemonManager;
}

/**
 * Mounts the PrintQueueDaemon drain loop on every device after settings load.
 * The loop itself no-ops until this device is the primary hub — so a late
 * hub claim still starts printing without requiring a full app restart.
 */
export function PrintQueueDaemon() {
  const { isPrimaryHub, loading, primaryDeviceId } = usePrintSettingsStore();

  useEffect(() => {
    if (loading) {
      console.log("[PRINT DAEMON] Waiting for print_settings…");
      return;
    }

    const deviceId = getLocalPrintDeviceId();
    console.log("[PRINT DAEMON] Settings ready", {
      deviceId,
      primaryDeviceId: primaryDeviceId || "(none)",
      isPrimaryHub,
    });

    // Always start the drain loop. It polls isLocalDevicePrimaryHub() and
    // idles until this phone is hub — fixes "reopen → never prints" when the
    // React gate used to skip startPrintQueueDaemon entirely.
    const stop = startPrintQueueDaemon();
    wakePrintQueueDaemon();

    if (!isPrimaryHub) {
      console.warn(
        "[PRINT DAEMON] Not primary hub — Bluetooth drain idle. Claim hub in Admin → Imprimantes.",
      );
      return () => {
        console.log("[PRINT DAEMON] Unmount (not hub)");
        stop();
      };
    }

    console.log("[PRINT DAEMON] Mount primary hub:", deviceId);

    const handlePayload = (payload: PostgresPayload) => {
      if (payload.eventType === "DELETE") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = payload.new as any;
      if (!row || row.status !== "pending") return;
      wakePrintQueueDaemon();
    };

    const manager = new RealtimeManager({
      channelName: `print-jobs-daemon-${deviceId.slice(0, 8)}`,
      listeners: [
        {
          schema: "public",
          table: "print_jobs",
          onPayload: handlePayload,
        },
      ],
      onResync: async () => {
        wakePrintQueueDaemon();
      },
    });
    _daemonManager = manager;
    void manager.init();
    wakePrintQueueDaemon();

    return () => {
      console.log("[PRINT DAEMON] Unmount");
      stop();
      void manager.destroy();
      if (_daemonManager === manager) _daemonManager = null;
    };
  }, [isPrimaryHub, loading, primaryDeviceId]);

  return null;
}

/** @deprecated — use PrintQueueDaemon */
export const KitchenPrintWorker = PrintQueueDaemon;
