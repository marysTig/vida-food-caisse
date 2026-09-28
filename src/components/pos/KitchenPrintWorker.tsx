import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import { printerService } from "@/lib/printerService";
import { getPrintersFromStore } from "@/lib/printerStore";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import { isLocalDevicePrimaryHub, usePrintSettingsStore } from "@/lib/printSettingsStore";
import {
  claimKitchenJob,
  fetchPendingKitchenJobs,
  kitchenJobAttemptCount,
  markKitchenJobDone,
  markKitchenJobFailed,
  MAX_KITCHEN_PRINT_ATTEMPTS,
  patchOrderKitchenFingerprints,
  reclaimStalePrintingJobs,
  requeueFailedKitchenJob,
  type KitchenPrintJob,
} from "@/lib/kitchenPrintQueue";
import { supabase } from "@/lib/supabase";

let _workerManager: RealtimeManager | null = null;

/** For __root.tsx foreground resync when this device is the print hub. */
export function getKitchenPrintRealtimeManager(): RealtimeManager | null {
  return _workerManager;
}

/**
 * Runs only on the primary print-hub device.
 * Claims pending kitchen_print_jobs and prints sequentially over Bluetooth.
 */
export function KitchenPrintWorker() {
  const { isPrimaryHub, loading } = usePrintSettingsStore();
  const processingRef = useRef(false);

  useEffect(() => {
    if (loading || !isPrimaryHub) {
      if (_workerManager) {
        void _workerManager.destroy();
        _workerManager = null;
      }
      return;
    }

    const deviceId = getLocalPrintDeviceId();
    console.log("[PRINT WORKER] Starting as primary hub:", deviceId);

    const processJob = async (job: KitchenPrintJob) => {
      const printers = getPrintersFromStore();
      const payload = job.payload;
      if (!payload?.stations?.length) {
        await markKitchenJobFailed(job.id, "Payload invalide (aucune station)", payload);
        return;
      }

      try {
        for (const station of payload.stations) {
          const printer = printers.find((p) => p.id === station.printerId);
          if (!printer || !printer.enabled) {
            throw new Error(
              `Imprimante introuvable ou désactivée: ${station.printerName || station.printerId}`,
            );
          }
          console.log(`[PRINT WORKER] Printing to ${printer.name}...`);
          await printerService.printKitchen(
            printer,
            station.lines,
            payload.orderLabel,
            payload.orderNote,
            payload.globalSupplements,
          );
        }

        await patchOrderKitchenFingerprints(
          payload.tableId,
          payload.fingerprints ?? {},
        );
        await markKitchenJobDone(job.id);
        console.log(`[PRINT WORKER] Job ${job.id} done`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[PRINT WORKER] Job ${job.id} failed:`, message);
        await markKitchenJobFailed(job.id, message, payload);
        toast.error("Erreur d'impression cuisine", {
          description: message,
        });
      }
    };

    const drainQueue = async () => {
      if (processingRef.current) return;
      if (!isLocalDevicePrimaryHub()) return;
      processingRef.current = true;
      try {
        const reclaimed = await reclaimStalePrintingJobs(deviceId);
        for (const job of reclaimed) {
          await processJob(job);
        }

        const { data: failed } = await supabase
          .from("kitchen_print_jobs")
          .select("*")
          .eq("status", "failed")
          .order("created_at", { ascending: true })
          .limit(10);

        for (const row of failed ?? []) {
          const job = row as KitchenPrintJob;
          const attempts = kitchenJobAttemptCount({
            ...job,
            payload: (row as { payload: KitchenPrintJob["payload"] }).payload,
          });
          if (attempts >= MAX_KITCHEN_PRINT_ATTEMPTS) continue;
          await requeueFailedKitchenJob((row as { id: string }).id);
        }

        const pending = await fetchPendingKitchenJobs();
        for (const job of pending) {
          const claimed = await claimKitchenJob(job.id, deviceId);
          if (claimed) await processJob(claimed);
        }
      } finally {
        processingRef.current = false;
      }
    };

    const handlePayload = (payload: PostgresPayload) => {
      if (payload.eventType === "DELETE") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = payload.new as any;
      if (!row || row.status !== "pending") return;
      void drainQueue();
    };

    const manager = new RealtimeManager({
      channelName: `kitchen-print-jobs-worker-${deviceId.slice(0, 8)}`,
      listeners: [
        {
          schema: "public",
          table: "kitchen_print_jobs",
          onPayload: handlePayload,
        },
      ],
      onResync: async () => {
        await drainQueue();
      },
    });
    _workerManager = manager;
    void manager.init();

    return () => {
      console.log("[PRINT WORKER] Stopping");
      void manager.destroy();
      if (_workerManager === manager) _workerManager = null;
    };
  }, [isPrimaryHub, loading]);

  return null;
}
