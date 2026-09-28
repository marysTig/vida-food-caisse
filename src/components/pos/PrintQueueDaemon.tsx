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
 * Mounts the PrintQueueDaemon on the primary hub device only.
 */
export function PrintQueueDaemon() {
  const { isPrimaryHub, loading } = usePrintSettingsStore();

  useEffect(() => {
    if (loading || !isPrimaryHub) {
      if (_daemonManager) {
        void _daemonManager.destroy();
        _daemonManager = null;
      }
      return;
    }

    if (!isLocalDevicePrimaryHub()) return;

    const deviceId = getLocalPrintDeviceId();
    console.log("[PRINT DAEMON] Mount primary hub:", deviceId);

    const stop = startPrintQueueDaemon();

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
    // Kick once on mount
    wakePrintQueueDaemon();

    return () => {
      console.log("[PRINT DAEMON] Unmount");
      stop();
      void manager.destroy();
      if (_daemonManager === manager) _daemonManager = null;
    };
  }, [isPrimaryHub, loading]);

  return null;
}

/** @deprecated — use PrintQueueDaemon */
export const KitchenPrintWorker = PrintQueueDaemon;
