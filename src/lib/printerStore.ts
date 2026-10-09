import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type PrinterType = "caisse" | "cuisine";
export type PrinterTransport = "bluetooth" | "usb";

/** Map legacy plaque/four rows to cuisine until DB migration is applied. */
export function normalizePrinterType(raw: unknown): PrinterType {
  if (raw === "caisse") return "caisse";
  if (raw === "cuisine" || raw === "plaque" || raw === "four") return "cuisine";
  return "cuisine";
}

export function normalizePrinterTransport(raw: unknown): PrinterTransport {
  return raw === "usb" ? "usb" : "bluetooth";
}

export type Printer = {
  id: string;
  name: string;
  type: PrinterType;
  transport: PrinterTransport;
  mac_address: string | null;
  usb_vendor_id: number | null;
  usb_product_id: number | null;
  enabled: boolean;
  /** @deprecated Legacy name-based routing — prefer category_ids */
  categories: string[];
  /** UUID category ids used for kitchen routing; empty = catch-all cuisine */
  category_ids: string[];
};

/** Resolve transport, inferring USB from VID/PID when the field is missing/stale. */
export function resolvePrinterTransport(printer: Printer): PrinterTransport {
  if (printer.transport === "usb") return "usb";
  if (
    printer.usb_vendor_id != null &&
    printer.usb_product_id != null &&
    Number.isFinite(printer.usb_vendor_id) &&
    Number.isFinite(printer.usb_product_id)
  ) {
    return "usb";
  }
  return "bluetooth";
}

/** True when the printer has the endpoint data required by its transport. */
export function isPrinterEndpointConfigured(printer: Printer): boolean {
  if (resolvePrinterTransport(printer) === "usb") {
    return (
      printer.usb_vendor_id != null &&
      printer.usb_product_id != null &&
      Number.isFinite(printer.usb_vendor_id) &&
      Number.isFinite(printer.usb_product_id)
    );
  }
  return (printer.mac_address ?? "").trim() !== "";
}

export function formatUsbId(vendorId: number, productId: number): string {
  const v = vendorId.toString(16).toUpperCase().padStart(4, "0");
  const p = productId.toString(16).toUpperCase().padStart(4, "0");
  return `${v}:${p}`;
}

type PrinterGlobalState = {
  printers: Printer[];
  loading: boolean;
  setPrinters: (printers: Printer[]) => void;
  setLoading: (loading: boolean) => void;
};

const usePrinterGlobalState = create<PrinterGlobalState>((set) => ({
  printers: [],
  loading: true,
  setPrinters: (printers) => set({ printers }),
  setLoading: (loading) => set({ loading }),
}));

function parseUuidArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .replace(/^{/, "")
        .replace(/}$/, "")
        .split(",")
        .map((s) => s.trim().replace(/^"/, "").replace(/"$/, ""))
        .filter(Boolean);
    }
  }
  return [];
}

function parseNameCategories(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .replace(/^{/, "")
        .replace(/}$/, "")
        .split(",")
        .map((s) => s.trim().replace(/^"/, "").replace(/"$/, ""))
        .filter(Boolean);
    }
  }
  return [];
}

function parseOptionalInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function fetchPrintersFromDB(): Promise<Printer[]> {
  const { data, error } = await supabase
    .from("printers")
    .select(
      "id, name, type, transport, mac_address, usb_vendor_id, usb_product_id, enabled, categories, category_ids, created_at",
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement imprimantes:", error.message);
    // Throw (not []) so a failed reload keeps the current printers — an empty
    // list made "Envoyer en cuisine" fail with "Aucune imprimante cuisine".
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => {
    const rawType = row["type"];
    const legacyStation = rawType === "plaque" || rawType === "four";
    return {
      id: row["id"] as string,
      name: row["name"] as string,
      type: normalizePrinterType(rawType),
      transport: normalizePrinterTransport(row["transport"]),
      mac_address: (row["mac_address"] as string | null) ?? null,
      usb_vendor_id: parseOptionalInt(row["usb_vendor_id"]),
      usb_product_id: parseOptionalInt(row["usb_product_id"]),
      enabled: (row["enabled"] as boolean) ?? true,
      categories: legacyStation ? [] : parseNameCategories(row["categories"]),
      category_ids: legacyStation ? [] : parseUuidArray(row["category_ids"]),
    };
  });
}

let _printerInitialized = false;

async function _initPrinterStore(
  setPrinters: (p: Printer[]) => void,
  setLoading: (l: boolean) => void,
) {
  if (_printerInitialized) return;
  _printerInitialized = true;

  const reload = async () => {
    setLoading(true);
    try {
      setPrinters(await fetchPrintersFromDB());
    } catch {
      /* keep current printers */
    } finally {
      setLoading(false);
    }
  };
  await reload();

  supabase
    .channel("printers-global")
    .on("postgres_changes", { event: "*", schema: "public", table: "printers" }, reload)
    .subscribe();
}

export function usePrinterStore() {
  const { printers, loading, setPrinters, setLoading } = usePrinterGlobalState();

  useEffect(() => {
    _initPrinterStore(setPrinters, setLoading);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPrinters(await fetchPrintersFromDB());
    } catch {
      /* keep current printers */
    } finally {
      setLoading(false);
    }
  }, [setPrinters, setLoading]);

  const addPrinter = async (printer: Omit<Printer, "id">) => {
    const transport = printer.transport ?? "bluetooth";
    const { error } = await supabase.from("printers").insert({
      name: printer.name,
      type: printer.type,
      transport,
      mac_address: transport === "bluetooth" ? printer.mac_address || null : null,
      usb_vendor_id: transport === "usb" ? printer.usb_vendor_id : null,
      usb_product_id: transport === "usb" ? printer.usb_product_id : null,
      enabled: printer.enabled,
      categories: printer.categories ?? [],
      category_ids: printer.category_ids ?? [],
    });
    if (error) throw new Error(error.message);
    await reload();
  };

  const updatePrinter = async (id: string, printer: Partial<Printer>) => {
    const patch: Record<string, unknown> = {};
    if (printer.name !== undefined) patch.name = printer.name;
    if (printer.type !== undefined) patch.type = printer.type;
    if (printer.transport !== undefined) patch.transport = printer.transport;
    if (printer.mac_address !== undefined) patch.mac_address = printer.mac_address;
    if (printer.usb_vendor_id !== undefined) patch.usb_vendor_id = printer.usb_vendor_id;
    if (printer.usb_product_id !== undefined) patch.usb_product_id = printer.usb_product_id;
    if (printer.enabled !== undefined) patch.enabled = printer.enabled;
    if (printer.categories !== undefined) patch.categories = printer.categories;
    if (printer.category_ids !== undefined) patch.category_ids = printer.category_ids;

    // Keep endpoint fields consistent with transport when switching.
    if (printer.transport === "usb") {
      patch.mac_address = null;
    } else if (printer.transport === "bluetooth") {
      patch.usb_vendor_id = null;
      patch.usb_product_id = null;
    }

    const { error } = await supabase.from("printers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  const deletePrinter = async (id: string) => {
    const { error } = await supabase.from("printers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  return {
    printers,
    loading,
    reload,
    addPrinter,
    updatePrinter,
    deletePrinter,
  };
}

/** Snapshot of printers without React (for queue worker / enqueue). */
export async function fetchPrintersOnce(): Promise<Printer[]> {
  return fetchPrintersFromDB();
}

export function getPrintersFromStore(): Printer[] {
  return usePrinterGlobalState.getState().printers;
}
