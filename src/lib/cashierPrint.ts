import { toast } from "sonner";
import type { CartItem } from "@/lib/cart";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";
import type { Printer } from "@/lib/printerStore";
import { printerService } from "@/lib/printerService";
import { logPrintActivity, updatePrintActivity } from "@/lib/printActivityLog";

export type CashierPrintResult = {
  attempted: number;
  succeeded: number;
  errors: string[];
};

/**
 * Always-on caisse receipt path for Encaisser.
 * Validates MAC, logs activity for Admin, surfaces toasts — never silent no-op.
 */
export async function runCashierReceiptPrint(params: {
  printers: Printer[];
  items: CartItem[];
  total: number;
  label: string | number;
  globalSupplements?: GlobalSupplement[];
}): Promise<CashierPrintResult> {
  const { items, total, label, globalSupplements } = params;
  const errors: string[] = [];
  let succeeded = 0;

  console.log("[CAISSE PRINT] Encaisser — starting receipt flow", {
    itemCount: items.length,
    total,
    label,
    printerCount: params.printers.length,
  });

  if (!printerService.isNativePlatform()) {
    const msg =
      "Bluetooth natif indisponible (plugin non chargé). Relancez l'app Android Capacitor.";
    console.error("[CAISSE PRINT]", msg);
    toast.error("Impression caisse impossible", { description: msg, duration: 8000 });
    return { attempted: 0, succeeded: 0, errors: [msg] };
  }

  const cashierPrinters = params.printers.filter(
    (p) => p.enabled && p.type === "caisse",
  );

  if (cashierPrinters.length === 0) {
    const msg =
      "Aucune imprimante type « caisse » activée. Configurez-en une dans Admin → Imprimantes.";
    console.error("[CAISSE PRINT]", msg, {
      all: params.printers.map((p) => ({
        name: p.name,
        type: p.type,
        enabled: p.enabled,
        mac: p.mac_address,
      })),
    });
    toast.error("Impression caisse impossible", { description: msg, duration: 8000 });
    return { attempted: 0, succeeded: 0, errors: [msg] };
  }

  toast.info("Impression du ticket caisse…", { duration: 2500 });

  for (const printer of cashierPrinters) {
    const mac = (printer.mac_address ?? "").trim();
    if (!mac) {
      const msg = `${printer.name}: adresse MAC manquante — associez l'imprimante Bluetooth.`;
      console.error("[CAISSE PRINT]", msg);
      errors.push(msg);
      logPrintActivity({
        kind: "caisse",
        printerName: printer.name,
        mac: null,
        status: "error",
        detail: msg,
      });
      toast.error("MAC manquante (caisse)", { description: msg, duration: 7000 });
      continue;
    }

    const activityId = logPrintActivity({
      kind: "caisse",
      printerName: printer.name,
      mac,
      status: "started",
      detail: `Ticket ${label}`,
    });

    console.log("[CAISSE PRINT] Firing printReceiptIsolated", {
      name: printer.name,
      mac,
      bytesHint: items.length,
    });

    try {
      await printerService.printReceiptIsolated(
        printer,
        items,
        total,
        label,
        globalSupplements,
      );
      succeeded += 1;
      updatePrintActivity(activityId, {
        status: "success",
        detail: `OK · ${label}`,
      });
      console.log("[CAISSE PRINT] Success", printer.name);
      toast.success(`Ticket caisse imprimé (${printer.name})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${printer.name}: ${message}`);
      updatePrintActivity(activityId, { status: "error", detail: message });
      console.error("[CAISSE PRINT] Failed", printer.name, message);
      toast.error("Erreur d'impression caisse", {
        description: `${printer.name}: ${message}`,
        duration: 8000,
      });
    }
  }

  return {
    attempted: cashierPrinters.length,
    succeeded,
    errors,
  };
}
