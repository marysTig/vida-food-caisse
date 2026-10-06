import { toast } from "sonner";
import type { CartItem } from "@/lib/cart";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";
import type { Printer } from "@/lib/printerStore";
import {
  fetchPrintersOnce,
  isPrinterEndpointConfigured,
  resolvePrinterTransport,
} from "@/lib/printerStore";
import { enqueueReceipt } from "@/lib/kitchenPrintQueue";
import { logPrintActivity } from "@/lib/printActivityLog";
import { wakePrintQueueDaemon } from "@/lib/printQueueDaemon";
import { isLocalDevicePrimaryHub } from "@/lib/printSettingsStore";
import { wakeNativePrintWorker } from "@/lib/hubPrintWorkerPlugin";

export type CashierPrintResult = {
  attempted: number;
  succeeded: number;
  errors: string[];
};

/**
 * Encaisser: enqueue receipt only — never awaits Bluetooth/USB I/O.
 * Always reloads printers from DB so USB config is not lost to a stale Zustand snapshot.
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

  // Prefer live DB row (USB VID/PID) over possibly stale React props.
  let printers = params.printers;
  try {
    const fresh = await fetchPrintersOnce();
    if (fresh.length > 0) printers = fresh;
  } catch (err) {
    console.warn("[CAISSE PRINT] fetchPrintersOnce failed — using props", err);
  }

  console.log("[CAISSE PRINT] Enqueue receipt (non-blocking)", {
    itemCount: items.length,
    total,
    label,
    tableId: params.tableId ?? null,
    isHub: isLocalDevicePrimaryHub(),
    printers: printers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      transport: resolvePrinterTransport(p),
      usb: `${p.usb_vendor_id}:${p.usb_product_id}`,
      mac: p.mac_address,
      enabled: p.enabled,
      configured: isPrinterEndpointConfigured(p),
    })),
  });

  if (!isLocalDevicePrimaryHub()) {
    toast.warning("Cet appareil n'est pas le hub d'impression", {
      description:
        "Le ticket est mis en file, mais seul le hub imprime. Admin → Imprimantes → Définir comme hub.",
      duration: 8000,
    });
  }

  const cashierPrinters = printers.filter(
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
  const transport = resolvePrinterTransport(caisse);
  if (!isPrinterEndpointConfigured(caisse)) {
    const msg =
      transport === "usb"
        ? `${caisse.name}: USB non configuré — sélectionnez le périphérique OTG.`
        : `${caisse.name}: adresse MAC manquante — associez l'imprimante Bluetooth.`;
    console.error("[CAISSE PRINT] endpoint missing", caisse);
    toast.error(
      transport === "usb" ? "USB manquant (caisse)" : "MAC manquante (caisse)",
      { description: msg, duration: 7000 },
    );
    return { attempted: 1, succeeded: 0, errors: [msg] };
  }

  // Prefer real table UUID; otherwise a non-uuid scope (DB column stays null)
  const tableId = params.tableId?.trim() || `anon:${Date.now()}`;

  const result = await enqueueReceipt({
    tableId,
    orderLabel: label,
    items,
    total,
    printers,
    checkoutTs: Date.now(),
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
    const msg = "Aucune imprimante caisse configurée (USB ou Bluetooth).";
    toast.error("Impression caisse impossible", { description: msg });
    return { attempted: 0, succeeded: 0, errors: [msg] };
  }

  if (result.status === "noop" && result.reason === "duplicate") {
    // Still wake worker — prior job may be pending/printing.
    wakePrintQueueDaemon();
    void wakeNativePrintWorker();
    toast.info("Ticket déjà en file", {
      description: caisse.name,
      duration: 2500,
    });
    return { attempted: 1, succeeded: 1, errors: [] };
  }

  logPrintActivity({
    kind: "caisse",
    printerName: caisse.name,
    mac:
      transport === "usb"
        ? `USB ${caisse.usb_vendor_id}:${caisse.usb_product_id}`
        : (caisse.mac_address ?? ""),
    status: "started",
    detail: `En file · ${label} · ${transport}`,
  });

  wakePrintQueueDaemon();
  void wakeNativePrintWorker();
  toast.success("Ticket en file d'impression", {
    description: `${caisse.name} (${transport === "usb" ? "USB" : "BT"})`,
    duration: 2500,
  });

  return { attempted: 1, succeeded: 1, errors: [] };
}
