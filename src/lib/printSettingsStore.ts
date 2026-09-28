import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { getLocalPrintDeviceId, PRINT_SETTINGS_ROW_ID } from "@/lib/printDevice";

type PrintSettingsState = {
  primaryDeviceId: string;
  fallbackKitchenPrinterId: string | null;
  loading: boolean;
  setPrimaryDeviceId: (id: string) => void;
  setFallbackKitchenPrinterId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
};

const usePrintSettingsGlobal = create<PrintSettingsState>((set) => ({
  primaryDeviceId: "",
  fallbackKitchenPrinterId: null,
  loading: true,
  setPrimaryDeviceId: (primaryDeviceId) => set({ primaryDeviceId }),
  setFallbackKitchenPrinterId: (fallbackKitchenPrinterId) =>
    set({ fallbackKitchenPrinterId }),
  setLoading: (loading) => set({ loading }),
}));

let _initialized = false;

async function fetchPrintSettings(): Promise<{
  primaryDeviceId: string;
  fallbackKitchenPrinterId: string | null;
}> {
  const { data, error } = await supabase
    .from("print_settings")
    .select("primary_device_id, fallback_kitchen_printer_id")
    .eq("id", PRINT_SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[print_settings] load error:", error.message);
    return { primaryDeviceId: "", fallbackKitchenPrinterId: null };
  }
  return {
    primaryDeviceId: (data?.primary_device_id as string | undefined) ?? "",
    fallbackKitchenPrinterId:
      (data?.fallback_kitchen_printer_id as string | null | undefined) ?? null,
  };
}

async function _initPrintSettings(
  setPrimaryDeviceId: (id: string) => void,
  setFallbackKitchenPrinterId: (id: string | null) => void,
  setLoading: (l: boolean) => void,
) {
  if (_initialized) return;
  _initialized = true;

  setLoading(true);
  const s = await fetchPrintSettings();
  setPrimaryDeviceId(s.primaryDeviceId);
  setFallbackKitchenPrinterId(s.fallbackKitchenPrinterId);
  setLoading(false);

  supabase
    .channel("print-settings-global")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_settings" },
      async () => {
        const next = await fetchPrintSettings();
        setPrimaryDeviceId(next.primaryDeviceId);
        setFallbackKitchenPrinterId(next.fallbackKitchenPrinterId);
      },
    )
    .subscribe();
}

export function usePrintSettingsStore() {
  const {
    primaryDeviceId,
    fallbackKitchenPrinterId,
    loading,
    setPrimaryDeviceId,
    setFallbackKitchenPrinterId,
    setLoading,
  } = usePrintSettingsGlobal();

  useEffect(() => {
    _initPrintSettings(
      setPrimaryDeviceId,
      setFallbackKitchenPrinterId,
      setLoading,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const localDeviceId = getLocalPrintDeviceId();
  const isPrimaryHub =
    !!primaryDeviceId && primaryDeviceId === localDeviceId;

  const claimPrimaryHub = useCallback(async () => {
    const deviceId = getLocalPrintDeviceId();
    const { error } = await supabase.from("print_settings").upsert(
      {
        id: PRINT_SETTINGS_ROW_ID,
        primary_device_id: deviceId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    setPrimaryDeviceId(deviceId);
    return deviceId;
  }, [setPrimaryDeviceId]);

  const setFallbackPrinter = useCallback(
    async (printerId: string | null) => {
      const { error } = await supabase.from("print_settings").upsert(
        {
          id: PRINT_SETTINGS_ROW_ID,
          primary_device_id:
            usePrintSettingsGlobal.getState().primaryDeviceId || "",
          fallback_kitchen_printer_id: printerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
      setFallbackKitchenPrinterId(printerId);
    },
    [setFallbackKitchenPrinterId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const s = await fetchPrintSettings();
    setPrimaryDeviceId(s.primaryDeviceId);
    setFallbackKitchenPrinterId(s.fallbackKitchenPrinterId);
    setLoading(false);
  }, [setPrimaryDeviceId, setFallbackKitchenPrinterId, setLoading]);

  return {
    primaryDeviceId,
    fallbackKitchenPrinterId,
    localDeviceId,
    isPrimaryHub,
    loading,
    claimPrimaryHub,
    setFallbackPrinter,
    reload,
  };
}

export function getPrimaryDeviceIdFromStore(): string {
  return usePrintSettingsGlobal.getState().primaryDeviceId;
}

export function getFallbackKitchenPrinterIdFromStore(): string | null {
  return usePrintSettingsGlobal.getState().fallbackKitchenPrinterId;
}

export function isLocalDevicePrimaryHub(): boolean {
  const primary = usePrintSettingsGlobal.getState().primaryDeviceId;
  return !!primary && primary === getLocalPrintDeviceId();
}
