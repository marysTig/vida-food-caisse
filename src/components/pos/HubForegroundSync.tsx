import { useEffect } from "react";
import { useEffectiveHubKeepActive } from "@/lib/hubKeepActiveStore";
import { syncHubForegroundService } from "@/lib/hubPrintPlugin";
import { usePrintSettingsStore } from "@/lib/printSettingsStore";

/**
 * Starts/stops the Android hub Foreground Service when this device is
 * primary hub and "keep hub active" is effectively on. No-op on web.
 */
export function HubForegroundSync() {
  const { isPrimaryHub, loading } = usePrintSettingsStore();
  const { effective } = useEffectiveHubKeepActive(isPrimaryHub);

  useEffect(() => {
    void syncHubForegroundService(!loading && isPrimaryHub && effective);
  }, [loading, isPrimaryHub, effective]);

  return null;
}
