import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import {
  BT_INTER_PRINTER_GAP_MS,
  printerService,
  settleBluetoothRadio,
} from "@/lib/printerService";
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
  type KitchenStationBundle,
} from "@/lib/kitchenPrintQueue";
import { supabase } from "@/lib/supabase";

let _workerManager: RealtimeManager | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** For __root.tsx foreground resync when this device is the print hub. */
export function getKitchenPrintRealtimeManager(): RealtimeManager | null {
  return _workerManager;
}

/**
 * Runs only on the primary print-hub device.
 * Claims pending kitchen_print_jobs and prints each station sequentially,
 * with explicit BT settle between printers so Plaque → Four does not race.
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

      console.log(
        `[PRINT WORKER] Job ${job.id} — ${payload.stations.length} station(s):`,
        payload.stations.map((s) => `${s.printerName}(${s.lines.length})`).join(", "),
      );

      const printedFingerprints: Record<string, string> = {};
      const failedStations: KitchenStationBundle[] = [];
      const stationErrors: string[] = [];

      // Always walk EVERY station — never abort the loop after the first printer.
      for (let i = 0; i < payload.stations.length; i++) {
        const station = payload.stations[i]!;
        const printer = printers.find((p) => p.id === station.printerId);

        if (!printer || !printer.enabled) {
          const msg = `Imprimante introuvable ou désactivée: ${station.printerName || station.printerId}`;
          console.error(`[PRINT WORKER] ${msg}`);
          failedStations.push(station);
          stationErrors.push(msg);
          continue;
        }

        console.log(
          `[PRINT WORKER] Station ${i + 1}/${payload.stations.length} → ${printer.name} (${station.lines.length} ligne(s))`,
        );

        try {
          await printerService.printKitchen(
            printer,
            station.lines,
            payload.orderLabel,
            payload.orderNote,
            payload.globalSupplements,
          );
          console.log(`[PRINT WORKER] Station OK: ${printer.name}`);
          for (const line of station.lines) {
            const fp = payload.fingerprints?.[line.id];
            if (fp) printedFingerprints[line.id] = fp;
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[PRINT WORKER] Station FAIL: ${printer.name}:`, message);
          failedStations.push(station);
          stationErrors.push(`${printer.name}: ${message}`);
          // Release radio before next MAC attempt
          try {
            await settleBluetoothRadio(`station-fail:${printer.name}`);
          } catch {
            /* ignore */
          }
        }

        // Gap before next printer (skip after last)
        if (i < payload.stations.length - 1) {
          console.log(
            `[PRINT WORKER] Inter-printer gap ${BT_INTER_PRINTER_GAP_MS}ms before next station`,
          );
          await sleep(BT_INTER_PRINTER_GAP_MS);
        }
      }

      // Stamp only lines that actually printed — retries won't re-hit Plaque after Four fails
      if (Object.keys(printedFingerprints).length > 0) {
        await patchOrderKitchenFingerprints(payload.tableId, printedFingerprints);
      }

      if (failedStations.length === 0) {
        await markKitchenJobDone(job.id);
        console.log(`[PRINT WORKER] Job ${job.id} done (all stations)`);
        return;
      }

      if (failedStations.length < payload.stations.length) {
        // Partial success: rewrite payload to remaining stations and requeue once
        const remainingFingerprints: Record<string, string> = {};
        for (const st of failedStations) {
          for (const line of st.lines) {
            const fp = payload.fingerprints?.[line.id];
            if (fp) remainingFingerprints[line.id] = fp;
          }
        }
        const nextPayload = {
          ...payload,
          stations: failedStations,
          deltaLineIds: failedStations.flatMap((s) => s.lines.map((l) => l.id)),
          fingerprints: remainingFingerprints,
          attemptCount:
            ((payload as { attemptCount?: number }).attemptCount ?? 0) + 1,
        };

        const attempts = (payload as { attemptCount?: number }).attemptCount ?? 0;
        if (attempts + 1 >= MAX_KITCHEN_PRINT_ATTEMPTS) {
          await markKitchenJobFailed(
            job.id,
            stationErrors.join(" | "),
            nextPayload,
          );
          toast.error("Impression cuisine partielle", {
            description: stationErrors.join(" · "),
          });
          return;
        }

        const { error } = await supabase
          .from("kitchen_print_jobs")
          .update({
            status: "pending",
            payload: nextPayload,
            claimed_by_device_id: null,
            error: stationErrors.join(" | "),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        if (error) {
          console.error("[PRINT WORKER] partial requeue error:", error.message);
          await markKitchenJobFailed(job.id, stationErrors.join(" | "), nextPayload);
        } else {
          console.log(
            `[PRINT WORKER] Job ${job.id} partial — requeued ${failedStations.length} station(s)`,
          );
          toast.warning("Réessai cuisine en cours", {
            description: stationErrors.join(" · "),
          });
        }
        return;
      }

      // All stations failed
      await markKitchenJobFailed(job.id, stationErrors.join(" | "), payload);
      toast.error("Erreur d'impression cuisine", {
        description: stationErrors.join(" · "),
      });
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
