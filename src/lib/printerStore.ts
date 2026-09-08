import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type PrinterType = "caisse" | "plaque" | "four";

export type Printer = {
  id: string;
  name: string;
  type: PrinterType;
  mac_address: string | null;
  enabled: boolean;
  categories: string[];
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

async function fetchPrintersFromDB(): Promise<Printer[]> {
  const { data, error } = await supabase
    .from("printers")
    .select("id, name, type, mac_address, enabled, categories, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement imprimantes:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => {
    let parsedCategories: string[] = [];
    if (Array.isArray(row["categories"])) {
      parsedCategories = row["categories"];
    } else if (typeof row["categories"] === "string") {
      try {
        parsedCategories = JSON.parse(row["categories"]);
      } catch (e) {
        parsedCategories = row["categories"]
          .replace(/^{/, "")
          .replace(/}$/, "")
          .split(",")
          .map((s: string) => s.trim().replace(/^"/, "").replace(/"$/, ""))
          .filter(Boolean);
      }
    }

    return {
      id: row["id"] as string,
      name: row["name"] as string,
      type: row["type"] as PrinterType,
      mac_address: (row["mac_address"] as string | null) ?? null,
      enabled: (row["enabled"] as boolean) ?? true,
      categories: parsedCategories,
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
      categories: printer.categories,
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
