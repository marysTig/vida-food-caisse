import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { getLocalPrintDeviceId, PRINT_SETTINGS_ROW_ID } from "@/lib/printDevice";

export type BtLaneMode = "parallel" | "serialized";

type PrintSettingsState = {
  primaryDeviceId: string;
  fallbackKitchenPrinterId: string | null;
  /** Native hub: one Bluetooth lane per kitchen printer, or legacy single lane. */
  btLaneMode: BtLaneMode;
  /** Native hub: reroute an offline kitchen printer's tickets to the other one. */
  kitchenAutoReroute: boolean;
  loading: boolean;
  setPrimaryDeviceId: (id: string) => void;
  setFallbackKitchenPrinterId: (id: string | null) => void;
  setHubOptions: (opts: { btLaneMode: BtLaneMode; kitchenAutoReroute: boolean }) => void;
  setLoading: (loading: boolean) => void;
};

const usePrintSettingsGlobal = create<PrintSettingsState>((set) => ({
  primaryDeviceId: "",
  fallbackKitchenPrinterId: null,
  btLaneMode: "parallel",
  kitchenAutoReroute: true,
  loading: true,
  setPrimaryDeviceId: (primaryDeviceId) => set({ primaryDeviceId }),
  setFallbackKitchenPrinterId: (fallbackKitchenPrinterId) =>
    set({ fallbackKitchenPrinterId }),
  setHubOptions: ({ btLaneMode, kitchenAutoReroute }) =>
    set({ btLaneMode, kitchenAutoReroute }),
  setLoading: (loading) => set({ loading }),
}));

let _initialized = false;

type FetchedPrintSettings = {
  primaryDeviceId: string;
  fallbackKitchenPrinterId: string | null;
  btLaneMode: BtLaneMode;
  kitchenAutoReroute: boolean;
};

async function fetchPrintSettings(): Promise<FetchedPrintSettings> {
  // select("*") — tolerates the hub columns before the hardening migration runs.
  const { data, error } = await supabase
    .from("print_settings")
    .select("*")
    .eq("id", PRINT_SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[print_settings] load error:", error.message);
    return {
      primaryDeviceId: "",
      fallbackKitchenPrinterId: null,
      btLaneMode: "parallel",
      kitchenAutoReroute: true,
    };
  }
  return {
    primaryDeviceId: (data?.primary_device_id as string | undefined) ?? "",
    fallbackKitchenPrinterId:
      (data?.fallback_kitchen_printer_id as string | null | undefined) ?? null,
    btLaneMode: data?.["bt_lane_mode"] === "serialized" ? "serialized" : "parallel",
    kitchenAutoReroute: (data?.["kitchen_auto_reroute"] as boolean | undefined) ?? true,
  };
}

function applyFetched(s: FetchedPrintSettings) {
  const g = usePrintSettingsGlobal.getState();
  g.setPrimaryDeviceId(s.primaryDeviceId);
  g.setFallbackKitchenPrinterId(s.fallbackKitchenPrinterId);
  g.setHubOptions({
    btLaneMode: s.btLaneMode,
    kitchenAutoReroute: s.kitchenAutoReroute,
  });
}

async function _initPrintSettings(setLoading: (l: boolean) => void) {
  if (_initialized) return;
  _initialized = true;

  setLoading(true);
  applyFetched(await fetchPrintSettings());
  setLoading(false);

  supabase
    .channel("print-settings-global")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_settings" },
      async () => {
        applyFetched(await fetchPrintSettings());
      },
    )
    .subscribe();
}

export function usePrintSettingsStore() {
  const {
    primaryDeviceId,
    fallbackKitchenPrinterId,
    btLaneMode,
    kitchenAutoReroute,
    loading,
    setPrimaryDeviceId,
    setFallbackKitchenPrinterId,
    setLoading,
  } = usePrintSettingsGlobal();

  useEffect(() => {
    _initPrintSettings(setLoading);
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

  /** Read by the native hub within ~15s (no APK restart needed). */
  const updateHubOptions = useCallback(
    async (patch: Partial<{ btLaneMode: BtLaneMode; kitchenAutoReroute: boolean }>) => {
      const row: {
        updated_at: string;
        bt_lane_mode?: BtLaneMode;
        kitchen_auto_reroute?: boolean;
      } = { updated_at: new Date().toISOString() };
      if (patch.btLaneMode) row.bt_lane_mode = patch.btLaneMode;
      if (patch.kitchenAutoReroute !== undefined) {
        row.kitchen_auto_reroute = patch.kitchenAutoReroute;
      }
      const { error } = await supabase
        .from("print_settings")
        .update(row)
        .eq("id", PRINT_SETTINGS_ROW_ID);
      if (error) {
        throw new Error(
          /bt_lane_mode|kitchen_auto_reroute/.test(error.message)
            ? "Migration print_pipeline_hardening_migration.sql non appliquée"
            : error.message,
        );
      }
      const cur = usePrintSettingsGlobal.getState();
      cur.setHubOptions({
        btLaneMode: patch.btLaneMode ?? cur.btLaneMode,
        kitchenAutoReroute: patch.kitchenAutoReroute ?? cur.kitchenAutoReroute,
      });
    },
    [],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    applyFetched(await fetchPrintSettings());
    setLoading(false);
  }, [setLoading]);

  return {
    primaryDeviceId,
    fallbackKitchenPrinterId,
    btLaneMode,
    kitchenAutoReroute,
    updateHubOptions,
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
