import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type PrinterType = "caisse" | "cuisine";

/** Map legacy plaque/four rows to cuisine until DB migration is applied. */
export function normalizePrinterType(raw: unknown): PrinterType {
  if (raw === "caisse") return "caisse";
  if (raw === "cuisine" || raw === "plaque" || raw === "four") return "cuisine";
  return "cuisine";
}

export type Printer = {
  id: string;
  name: string;
  type: PrinterType;
  mac_address: string | null;
  enabled: boolean;
  /** @deprecated Legacy name-based routing — prefer category_ids */
  categories: string[];
  /** UUID category ids used for kitchen routing; empty = catch-all cuisine */
  category_ids: string[];
};

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

async function fetchPrintersFromDB(): Promise<Printer[]> {
  const { data, error } = await supabase
    .from("printers")
    .select("id, name, type, mac_address, enabled, categories, category_ids, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement imprimantes:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => {
    const rawType = row["type"];
    const legacyStation = rawType === "plaque" || rawType === "four";
    return {
      id: row["id"] as string,
      name: row["name"] as string,
      type: normalizePrinterType(rawType),
      mac_address: (row["mac_address"] as string | null) ?? null,
      enabled: (row["enabled"] as boolean) ?? true,
      categories: legacyStation ? [] : parseNameCategories(row["categories"]),
      // Legacy plaque/four become catch-all cuisine until DB migration clears filters
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

  setLoading(true);
  const printers = await fetchPrintersFromDB();
  setPrinters(printers);
  setLoading(false);

  const reload = async () => {
    setLoading(true);
    const p = await fetchPrintersFromDB();
    setPrinters(p);
    setLoading(false);
  };

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
    const p = await fetchPrintersFromDB();
    setPrinters(p);
    setLoading(false);
  }, [setPrinters, setLoading]);

  const addPrinter = async (printer: Omit<Printer, "id">) => {
    const { error } = await supabase.from("printers").insert({
      name: printer.name,
      type: printer.type,
      mac_address: printer.mac_address || null,
      enabled: printer.enabled,
      categories: printer.categories ?? [],
      category_ids: printer.category_ids ?? [],
    });
    if (error) throw new Error(error.message);
    await reload();
  };

  const updatePrinter = async (id: string, printer: Partial<Printer>) => {
    const { error } = await supabase
      .from("printers")
      .update({
        ...(printer.name !== undefined && { name: printer.name }),
        ...(printer.type !== undefined && { type: printer.type }),
        ...(printer.mac_address !== undefined && { mac_address: printer.mac_address }),
        ...(printer.enabled !== undefined && { enabled: printer.enabled }),
        ...(printer.categories !== undefined && { categories: printer.categories }),
        ...(printer.category_ids !== undefined && { category_ids: printer.category_ids }),
      })
      .eq("id", id);
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
