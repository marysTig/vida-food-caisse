import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import {
  cancelNeedsManualJobs,
  fetchNeedsManualJobs,
  retryAllNeedsManual,
  type PrintJob,
} from "@/lib/kitchenPrintQueue";
import { wakePrintQueueDaemon } from "@/lib/printQueueDaemon";
import {
  isNativePrintWorkerActive,
  nativeTriggerManualRetry,
  wakeNativePrintWorker,
} from "@/lib/hubPrintWorkerPlugin";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * POS-level banner when print jobs exhausted retries (needs_manual).
 * Réimprimer resets attempts; Annuler drops the tickets after confirmation —
 * no Admin navigation required.
 */
export function PrintFailureBanner() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Tickets shown in the confirmation — only these are cancelled. */
  const [confirmJobs, setConfirmJobs] = useState<PrintJob[] | null>(null);

  const refresh = useCallback(async () => {
    const list = await fetchNeedsManualJobs();
    setJobs(list);
  }, []);

  useEffect(() => {
    void refresh();

    const manager = new RealtimeManager({
      channelName: "print-jobs-failure-banner",
      listeners: [
        {
          schema: "public",
          table: "print_jobs",
          onPayload: (_payload: PostgresPayload) => {
            void refresh();
          },
        },
      ],
      onResync: async () => {
        await refresh();
      },
    });
    void manager.init();
    return () => {
      void manager.destroy();
    };
  }, [refresh]);

  const busy = retrying || cancelling;

  const onRetryAll = async () => {
    if (busy || jobs.length === 0) return;
    setRetrying(true);
    try {
      const n = await retryAllNeedsManual();
      if (isNativePrintWorkerActive()) {
        try {
          await nativeTriggerManualRetry();
        } catch {
          /* JS already reset needs_manual rows */
        }
        void wakeNativePrintWorker();
      }
      toast.success(
        n > 0
          ? `${n} ticket(s) remis en file d'impression`
          : "Aucun ticket à relancer",
      );
      await refresh();
      wakePrintQueueDaemon();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Relance impossible", { description: msg });
    } finally {
      setRetrying(false);
    }
  };

  const onConfirmCancel = async () => {
    const toCancel = confirmJobs ?? [];
    if (cancelling || toCancel.length === 0) return;
    setCancelling(true);
    try {
      const n = await cancelNeedsManualJobs(toCancel.map((j) => j.id));
      toast.success(
        n > 0 ? `${n} ticket(s) annulé(s)` : "Tickets déjà traités",
      );
      setConfirmJobs(null);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Annulation impossible", { description: msg });
    } finally {
      setCancelling(false);
    }
  };

  if (jobs.length === 0 && !confirmJobs) return null;

  const stations = [
    ...new Set(
      jobs.map((j) => j.printer_name).filter((n): n is string => !!n),
    ),
  ];
  const confirmCount = confirmJobs?.length ?? 0;

  return (
    <>
      {jobs.length > 0 && (
        <div
          role="alert"
          className="fixed bottom-0 inset-x-0 z-[90] border-t border-amber-700/40 bg-amber-950 text-amber-50 px-4 py-3 shadow-lg"
        >
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {jobs.length} ticket{jobs.length > 1 ? "s" : ""} non imprimé
                {jobs.length > 1 ? "s" : ""}
              </p>
              {stations.length > 0 && (
                <p className="text-xs text-amber-200/90 truncate">
                  {stations.join(" · ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmJobs(jobs)}
                className="rounded-md border border-amber-300/60 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-900 disabled:opacity-60"
              >
                Annuler l&apos;impression
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRetryAll()}
                className="rounded-md bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
              >
                {retrying ? "Relance…" : "Réimprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={confirmJobs !== null}
        onOpenChange={(open) => {
          if (!open && !cancelling) setConfirmJobs(null);
        }}
      >
        <AlertDialogContent className="z-[130]" overlayClassName="z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Annuler {confirmCount} ticket{confirmCount > 1 ? "s" : ""} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ces tickets ne seront pas imprimés. Les articles cuisine annulés ne
              seront pas renvoyés au prochain « Valider ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-sm">
            {(confirmJobs ?? []).map((j) => (
              <li key={j.id} className="flex justify-between gap-3">
                <span className="font-medium">
                  {j.job_type === "receipt" ? "Ticket caisse" : "Cuisine"} ·{" "}
                  {j.printer_name ?? "?"}
                </span>
                <span className="text-muted-foreground">
                  {j.payload?.orderLabel != null ? `#${j.payload.orderLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Retour</AlertDialogCancel>
            <button
              type="button"
              disabled={cancelling}
              onClick={() => void onConfirmCancel()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {cancelling ? "Annulation…" : "Confirmer l'annulation"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
