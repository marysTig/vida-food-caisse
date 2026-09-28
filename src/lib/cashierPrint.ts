import { toast } from "sonner";
import type { CartItem } from "@/lib/cart";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";
import type { Printer } from "@/lib/printerStore";
import { enqueueReceipt } from "@/lib/kitchenPrintQueue";
import { logPrintActivity } from "@/lib/printActivityLog";
import { wakePrintQueueDaemon } from "@/lib/printQueueDaemon";

export type CashierPrintResult = {
  attempted: number;
  succeeded: number;
  errors: string[];
};

/**
 * Encaisser: enqueue receipt only — never awaits Bluetooth.
 * PrintQueueDaemon prints asynchronously with receipt priority.
 */
export async function runCashierReceiptPrint(params: {
  printers: Printer[];
  items: CartItem[];
  total: number;
  label: string | number;
  globalSupplements?: GlobalSupplement[];
  tableId?: string;
}): Promise<CashierPrintResult> {
  const { items, total, label, globalSupplements } = params;
  const errors: string[] = [];

  console.log("[CAISSE PRINT] Enqueue receipt (non-blocking)", {
    itemCount: items.length,
    total,
    label,
  });

  const cashierPrinters = params.printers.filter(
    (p) => p.enabled && p.type === "caisse",
  );

  if (cashierPrinters.length === 0) {
    const msg =
      "Aucune imprimante type « caisse » activée. Configurez-en une dans Admin → Imprimantes.";
    console.error("[CAISSE PRINT]", msg);
    toast.error("Impression caisse impossible", {
      description: msg,
      duration: 8000,
    });
    return { attempted: 0, succeeded: 0, errors: [msg] };
  }

  const caisse = cashierPrinters[0]!;
  const mac = (caisse.mac_address ?? "").trim();
  if (!mac) {
    const msg = `${caisse.name}: adresse MAC manquante — associez l'imprimante Bluetooth.`;
    toast.error("MAC manquante (caisse)", { description: msg, duration: 7000 });
    return { attempted: 1, succeeded: 0, errors: [msg] };
  }

  const tableId =
    params.tableId ??
    `receipt-${typeof label === "string" || typeof label === "number" ? label : "x"}`;

  const result = await enqueueReceipt({
    tableId: String(tableId),
    orderLabel: label,
    items,
    total,
    printers: params.printers,
    ...(globalSupplements?.length ? { globalSupplements } : {}),
  });

  if (result.status === "error") {
    errors.push(result.message);
    toast.error("Impossible de mettre le ticket en file", {
      description: result.message,
    });
    return { attempted: 1, succeeded: 0, errors };
  }

  if (result.status === "noop" && result.reason === "no_printer") {
    const msg = "Aucune imprimante caisse avec MAC.";
    toast.error("Impression caisse impossible", { description: msg });
    return { attempted: 0, succeeded: 0, errors: [msg] };
  }

  logPrintActivity({
    kind: "caisse",
    printerName: caisse.name,
    mac,
    status: "started",
    detail: `En file · ${label}`,
  });

  wakePrintQueueDaemon();
  toast.success("Ticket en file d'impression", {
    description: caisse.name,
    duration: 2500,
  });

  return { attempted: 1, succeeded: 1, errors: [] };
}
