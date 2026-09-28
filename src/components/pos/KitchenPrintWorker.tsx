import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import {
  BT_HARD_SETTLE_MS,
  KitchenAbortedError,
  printerService,
  settleBluetoothRadio,
} from "@/lib/printerService";
import { getPrintersFromStore } from "@/lib/printerStore";
import { getLocalPrintDeviceId } from "@/lib/printDevice";
import {
  getFallbackKitchenPrinterIdFromStore,
  isLocalDevicePrimaryHub,
  usePrintSettingsStore,
} from "@/lib/printSettingsStore";
import {
  claimKitchenJob,
  enqueueFallbackKitchenJob,
  fetchPendingKitchenJobs,
  markKitchenJobDone,
  markKitchenJobFailed,
  patchOrderKitchenFingerprints,
  reclaimStalePrintingJobs,
  type KitchenPrintJob,
  type KitchenStationBundle,
} from "@/lib/kitchenPrintQueue";
import { isCircuitOpen, openCircuit } from "@/lib/kitchenCircuitBreaker";

let _workerManager: RealtimeManager | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getKitchenPrintRealtimeManager(): RealtimeManager | null {
  return _workerManager;
}

/**
 * Primary hub worker: single-flight, per-MAC circuit breaker,
 * 1.5s hard settle between MACs. Never blocks receipt (receipt preempts radio).
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
        `[PRINT WORKER] Job ${job.id} — ${payload.stations.length} station(s)`,
      );

      const printedFingerprints: Record<string, string> = {};
      const failedStations: KitchenStationBundle[] = [];
      const stationErrors: string[] = [];

      for (let i = 0; i < payload.stations.length; i++) {
        const station = payload.stations[i]!;
        const printer = printers.find((p) => p.id === station.printerId);

        if (!printer || !printer.enabled) {
          const msg = `Imprimante introuvable ou désactivée: ${station.printerName || station.printerId}`;
          failedStations.push(station);
          stationErrors.push(msg);
          continue;
        }

        if (isCircuitOpen(printer.mac_address)) {
          const msg = `Circuit ouvert (${printer.name}) — pas de tentative BT`;
          console.log(`[PRINT WORKER] ${msg}`);
          failedStations.push(station);
          stationErrors.push(msg);
          continue;
        }

        console.log(
          `[PRINT WORKER] Station ${i + 1}/${payload.stations.length} → ${printer.name}`,
        );

        try {
          await printerService.printKitchenCancellable(
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
          if (err instanceof KitchenAbortedError) {
            console.log(`[PRINT WORKER] Station aborted (receipt preempt): ${printer.name}`);
            failedStations.push(station);
            stationErrors.push(`${printer.name}: interrompu par encaissement`);
            // Do not open circuit on preempt — radio was taken by receipt
          } else {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[PRINT WORKER] Station FAIL: ${printer.name}:`, message);
            openCircuit(printer.mac_address, message);
            failedStations.push(station);
            stationErrors.push(`${printer.name}: ${message}`);
            try {
              await settleBluetoothRadio(`station-fail:${printer.name}`);
            } catch {
              /* ignore */
            }
          }
        }

        if (i < payload.stations.length - 1) {
          console.log(
            `[PRINT WORKER] Hard settle ${BT_HARD_SETTLE_MS}ms before next MAC`,
          );
          await sleep(BT_HARD_SETTLE_MS);
        }
      }

      if (Object.keys(printedFingerprints).length > 0) {
        await patchOrderKitchenFingerprints(payload.tableId, printedFingerprints);
      }

      if (failedStations.length === 0) {
        await markKitchenJobDone(job.id);
        console.log(`[PRINT WORKER] Job ${job.id} done`);
        return;
      }

      // Fallback consolidated printer for failed stations (no tight BT retry loop)
      const fallbackId = getFallbackKitchenPrinterIdFromStore();
      const fallback = fallbackId
        ? printers.find((p) => p.id === fallbackId && p.enabled)
        : undefined;

      if (fallback && !isCircuitOpen(fallback.mac_address)) {
        const lines = failedStations.flatMap((s) => s.lines);
        const fingerprints: Record<string, string> = {};
        for (const line of lines) {
          const fp = payload.fingerprints?.[line.id];
          if (fp) fingerprints[line.id] = fp;
        }
        try {
          const fbArgs: Parameters<typeof enqueueFallbackKitchenJob>[0] = {
            tableId: payload.tableId,
            orderLabel: payload.orderLabel,
            fallbackPrinter: fallback,
            lines,
            fingerprints,
            sourceJobId: job.id,
          };
          if (payload.orderNote) fbArgs.orderNote = payload.orderNote;
          if (payload.globalSupplements?.length) {
            fbArgs.globalSupplements = payload.globalSupplements;
          }
          const fb = await enqueueFallbackKitchenJob(fbArgs);
          if (fb.status === "enqueued") {
            toast.warning(
              `Station(s) indisponible(s) — bascule vers ${fallback.name}`,
              { description: stationErrors.join(" · ") },
            );
            // Original job done for accounting; fallback is a new pending job
            await markKitchenJobDone(job.id);
            return;
          }
        } catch (e) {
          console.error("[PRINT WORKER] fallback enqueue failed", e);
        }
      }

      // No fallback / fallback failed — leave job failed for manual retry (no auto-requeue storm)
      await markKitchenJobFailed(job.id, stationErrors.join(" | "), {
        ...payload,
        stations: failedStations,
        deltaLineIds: failedStations.flatMap((s) => s.lines.map((l) => l.id)),
      });
      toast.error("Impression cuisine incomplète", {
        description:
          stationErrors.join(" · ") +
          " — utilisez « Réimprimer cuisine » ou configurez une imprimante de secours.",
        duration: 8000,
      });
    };

    const drainQueue = async () => {
      if (processingRef.current) return;
      if (!isLocalDevicePrimaryHub()) return;
      processingRef.current = true;
      try {
        // Stale reclaim only — do NOT auto-requeue all failed (respects circuit breaker)
        const reclaimed = await reclaimStalePrintingJobs(deviceId);
        for (const job of reclaimed) {
          await processJob(job);
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
