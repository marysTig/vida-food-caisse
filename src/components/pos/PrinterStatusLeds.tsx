import { useEffect } from "react";
import { useSessionStore } from "@/lib/authStore";
import { usePrinterStore } from "@/lib/printerStore";
import {
  reconnectPrinterSlot,
  startPrinterLinkMonitor,
  usePrinterLinkSlots,
  type LedTone,
  type PrinterLedSlot,
} from "@/lib/printerLinkStatus";
import { cn } from "@/lib/utils";

function toneClass(tone: LedTone): string {
  switch (tone) {
    case "ready":
      return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]";
    case "pending":
      return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] animate-pulse";
    case "error":
      return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]";
    default:
      return "bg-muted-foreground/35";
  }
}

function SlotLed({ slot }: { slot: PrinterLedSlot }) {
  const clickable = !!slot.printer && slot.tone === "error";
  const title = `${slot.label}: ${slot.detail}${
    clickable ? " — appuyer pour reconnecter" : ""
  }`;

  return (
    <button
      type="button"
      disabled={!clickable}
      title={title}
      aria-label={title}
      onClick={() => {
        if (!clickable) return;
        void reconnectPrinterSlot(slot);
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-left transition-colors",
        clickable
          ? "hover:bg-red-500/10 cursor-pointer active:scale-[0.98]"
          : "cursor-default opacity-95",
      )}
    >
      <span
        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", toneClass(slot.tone))}
        aria-hidden
      />
      <span className="max-w-[4.5rem] truncate text-[10px] font-semibold leading-none text-muted-foreground sm:max-w-[6rem]">
        {slot.label}
      </span>
    </button>
  );
}

/**
 * LED printer status for the caisse POS header only (hidden for serveur).
 */
export function PrinterStatusLeds({ className }: { className?: string }) {
  const role = useSessionStore((s) => s.currentUser?.role);
  const { printers } = usePrinterStore();
  const slots = usePrinterLinkSlots();

  useEffect(() => {
    if (role === "serveur") return;
    return startPrinterLinkMonitor();
  }, [role, printers]);

  if (role === "serveur") return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="status"
      aria-label="État des imprimantes"
    >
      {slots.map((slot) => (
        <SlotLed key={slot.key} slot={slot} />
      ))}
    </div>
  );
}
