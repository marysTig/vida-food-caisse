import { useEffect } from "react";
import { syncHubForegroundService } from "@/lib/hubPrintPlugin";
import { usePrintSettingsStore } from "@/lib/printSettingsStore";

/**
 * Starts/stops the Android hub Foreground Service when this device is
 * primary hub. Aligns with print-stack mount (hub always — independent of
 * keep-active / login). FGS is process keep-alive only until Phase 1 native worker.
 */
export function HubForegroundSync() {
  const { isPrimaryHub, loading } = usePrintSettingsStore();

  useEffect(() => {
    void syncHubForegroundService(!loading && isPrimaryHub);
  }, [loading, isPrimaryHub]);

  return null;
}
