/**
 * Real-time POS printer link status (Caisse USB + up to 2 Cuisine BT).
 * Driven by native USB/BT events with a light poll fallback; reconnect via adminProbe.
 */

import { create } from "zustand";
import { toast } from "sonner";
import {
  isNativePrintWorkerPlatform,
  nativeAdminProbe,
  nativeAdminUsbProbe,
  nativeGetPrinterLinkStatus,
  subscribeNativePrinterLinkChanges,
  type NativePrinterLinkQuery,
  type NativePrinterLinkStatus,
} from "@/lib/hubPrintWorkerPlugin";
import {
  getPrintersFromStore,
  isPrinterEndpointConfigured,
  resolvePrinterTransport,
  type Printer,
} from "@/lib/printerStore";

export type LedTone = "ready" | "pending" | "error" | "idle";

export type PrinterLedSlot = {
  key: "caisse" | "cuisine1" | "cuisine2";
  label: string;
  printer: Printer | null;
  tone: LedTone;
  detail: string;
  reconnectable: boolean;
};

type LinkState = {
  slots: PrinterLedSlot[];
  reconnectingId: string | null;
  lastNative: Record<string, NativePrinterLinkStatus>;
};

const EMPTY_SLOTS: PrinterLedSlot[] = [
  {
    key: "caisse",
    label: "Caisse",
    printer: null,
    tone: "idle",
    detail: "Non configurée",
    reconnectable: false,
  },
  {
    key: "cuisine1",
    label: "Cuisine 1",
    printer: null,
    tone: "idle",
    detail: "Non configurée",
    reconnectable: false,
  },
  {
    key: "cuisine2",
    label: "Cuisine 2",
    printer: null,
    tone: "idle",
    detail: "Non configurée",
    reconnectable: false,
  },
];

const usePrinterLinkState = create<LinkState>(() => ({
  slots: EMPTY_SLOTS,
  reconnectingId: null,
  lastNative: {},
}));

let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubNative: (() => void) | null = null;
let refreshInFlight = false;

function pickPosPrinters(printers: Printer[]): {
  caisse: Printer | null;
  cuisine: Printer[];
} {
  const enabled = printers.filter(
    (p) => p.enabled && isPrinterEndpointConfigured(p),
  );
  const caisse =
    enabled.find((p) => p.type === "caisse") ??
    enabled.find((p) => resolvePrinterTransport(p) === "usb") ??
    null;
  const cuisine = enabled
    .filter((p) => p.type === "cuisine" && resolvePrinterTransport(p) === "bluetooth")
    .slice(0, 2);
  return { caisse, cuisine };
}

function mapNativeTone(
  native: NativePrinterLinkStatus | undefined,
  reconnecting: boolean,
): { tone: LedTone; detail: string } {
  if (reconnecting) {
    return { tone: "pending", detail: "Reconnexion…" };
  }
  if (!native) {
    return { tone: "pending", detail: "Statut…" };
  }
  switch (native.state) {
    case "ready":
      return { tone: "ready", detail: native.detail || "Prête" };
    case "pending":
    case "no_permission":
      return { tone: "pending", detail: native.detail || "En attente…" };
    case "unconfigured":
      return { tone: "idle", detail: native.detail || "Non configurée" };
    case "disconnected":
    default:
      return { tone: "error", detail: native.detail || "Déconnectée" };
  }
}

function buildSlots(
  printers: Printer[],
  nativeById: Record<string, NativePrinterLinkStatus>,
  reconnectingId: string | null,
): PrinterLedSlot[] {
  const { caisse, cuisine } = pickPosPrinters(printers);
  const cuisine1 = cuisine[0] ?? null;
  const cuisine2 = cuisine[1] ?? null;

  const slotFor = (
    key: PrinterLedSlot["key"],
    defaultLabel: string,
    printer: Printer | null,
  ): PrinterLedSlot => {
    if (!printer) {
      return {
        key,
        label: defaultLabel,
        printer: null,
        tone: "idle",
        detail: "Non configurée",
        reconnectable: false,
      };
    }
    const reconnecting = reconnectingId === printer.id;
    const { tone, detail } = mapNativeTone(nativeById[printer.id], reconnecting);
    return {
      key,
      label: printer.name || defaultLabel,
      printer,
      tone,
      detail,
      reconnectable: tone === "error" || tone === "pending",
    };
  };

  return [
    slotFor("caisse", "Caisse", caisse),
    slotFor("cuisine1", "Cuisine 1", cuisine1),
    slotFor("cuisine2", "Cuisine 2", cuisine2),
  ];
}

function toQuery(printer: Printer): NativePrinterLinkQuery {
  const transport = resolvePrinterTransport(printer);
  return {
    id: printer.id,
    name: printer.name,
    transport,
    macAddress: printer.mac_address,
    vendorId: printer.usb_vendor_id,
    productId: printer.usb_product_id,
  };
}

async function refreshFromNative(): Promise<void> {
  if (refreshInFlight) return;
  if (!isNativePrintWorkerPlatform()) {
    usePrinterLinkState.setState({
      slots: buildSlots(getPrintersFromStore(), {}, null).map((s) =>
        s.printer
          ? { ...s, tone: "pending", detail: "Web — statut natif indisponible" }
          : s,
      ),
    });
    return;
  }

  refreshInFlight = true;
  try {
    const printers = getPrintersFromStore();
    const { caisse, cuisine } = pickPosPrinters(printers);
    const targets = [caisse, ...cuisine].filter(Boolean) as Printer[];
    if (targets.length === 0) {
      usePrinterLinkState.setState({
        lastNative: {},
        slots: buildSlots(printers, {}, usePrinterLinkState.getState().reconnectingId),
      });
      return;
    }
    const nativeList = await nativeGetPrinterLinkStatus(targets.map(toQuery));
    const nativeById: Record<string, NativePrinterLinkStatus> = {};
    for (const n of nativeList) nativeById[n.id] = n;

    // If native returned nothing, keep previous tones but don't stay forever on
    // "Statut…" — mark as error so the cashier can tap reconnect.
    if (nativeList.length === 0) {
      console.warn("[PrinterLink] native status empty", { asked: targets.length });
      for (const t of targets) {
        nativeById[t.id] = {
          id: t.id,
          name: t.name,
          transport: resolvePrinterTransport(t),
          state: "disconnected",
          detail: "Statut natif indisponible",
        };
      }
    }

    const reconnectingId = usePrinterLinkState.getState().reconnectingId;
    usePrinterLinkState.setState({
      lastNative: nativeById,
      slots: buildSlots(printers, nativeById, reconnectingId),
    });
  } finally {
    refreshInFlight = false;
  }
}

/** Start polling + native listeners (idempotent). */
export function startPrinterLinkMonitor(): () => void {
  if (started) {
    void refreshFromNative();
    return stopPrinterLinkMonitor;
  }
  started = true;
  void refreshFromNative();
  pollTimer = setInterval(() => {
    void refreshFromNative();
  }, 4_000);
  void subscribeNativePrinterLinkChanges(() => {
    void refreshFromNative();
  }).then((unsub) => {
    unsubNative = unsub;
  });
  return stopPrinterLinkMonitor;
}

export function stopPrinterLinkMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (unsubNative) {
    unsubNative();
    unsubNative = null;
  }
  started = false;
}

export function usePrinterLinkSlots(): PrinterLedSlot[] {
  return usePrinterLinkState((s) => s.slots);
}

export function getPrinterLinkSlots(): PrinterLedSlot[] {
  return usePrinterLinkState.getState().slots;
}

/** Manual reconnect for a red/pending LED (native adminProbe). */
export async function reconnectPrinterSlot(slot: PrinterLedSlot): Promise<void> {
  const printer = slot.printer;
  if (!printer) return;
  if (!isNativePrintWorkerPlatform()) {
    toast.error("Reconnexion native indisponible hors tablette");
    return;
  }

  usePrinterLinkState.setState((s) => ({
    reconnectingId: printer.id,
    slots: buildSlots(getPrintersFromStore(), s.lastNative, printer.id),
  }));

  try {
    const transport = resolvePrinterTransport(printer);
    const result =
      transport === "usb"
        ? await nativeAdminUsbProbe(
            printer.name,
            printer.usb_vendor_id!,
            printer.usb_product_id!,
          )
        : await nativeAdminProbe(printer.name, printer.mac_address!.trim());

    if (result.ok) {
      toast.success(`${printer.name} reconnectée`, { description: result.detail });
    } else {
      toast.error(`${printer.name} — échec`, { description: result.detail });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(`${printer.name} — échec`, { description: msg });
  } finally {
    usePrinterLinkState.setState({ reconnectingId: null });
    await refreshFromNative();
  }
}
