import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import { useEffect } from "react";

export type GlobalSupplement = {
  id: string;
  label: string;
  price: number;
  created_at: string;
};

type GlobalSupplementsState = {
  supplements: GlobalSupplement[];
  loading: boolean;
  setSupplements: (supplements: GlobalSupplement[] | ((prev: GlobalSupplement[]) => GlobalSupplement[])) => void;
  setLoading: (loading: boolean) => void;
};

export const useGlobalSupplementsStore = create<GlobalSupplementsState>((set) => ({
  supplements: [],
  loading: true,
  setSupplements: (supplements) => set((state) => ({
    supplements: typeof supplements === 'function' ? supplements(state.supplements) : supplements
  })),
  setLoading: (loading) => set({ loading }),
}));

async function fetchSupplementsFromDB(): Promise<GlobalSupplement[]> {
  const { data, error } = await supabase
    .from("global_supplements")
    .select("id, label, price, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement suppléments globaux:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row["id"] as string,
    label: row["label"] as string,
    price: row["price"] as number,
    created_at: row["created_at"] as string,
  }));
}

export async function reloadGlobalSupplements(isInitialLoad = false) {
  const store = useGlobalSupplementsStore.getState();
  if (isInitialLoad) store.setLoading(true);
  try {
    const fetched = await fetchSupplementsFromDB();
    store.setSupplements(fetched);
  } catch (error) {
    console.error("Error reloading global supplements:", error);
  } finally {
    store.setLoading(false);
  }
}

function handlePayload(payload: PostgresPayload): void {
  const store = useGlobalSupplementsStore.getState();

  if (payload.eventType === "DELETE") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setSupplements((prev) => prev.filter(s => s.id !== (payload.old as any).id));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = payload.new as any;
    const item: GlobalSupplement = {
      id: row["id"],
      label: row["label"],
      price: row["price"],
      created_at: row["created_at"],
    };

    store.setSupplements((prev) => {
      if (prev.some(s => s.id === item.id)) {
        return prev.map(s => s.id === item.id ? item : s);
      }
      return [...prev, item].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }
}

let _manager: RealtimeManager | null = null;

function getGlobalSupplementsManager(): RealtimeManager {
  if (!_manager) {
    _manager = new RealtimeManager({
      channelName: "global-supplements-realtime",
      listeners: [
        {
          schema: "public",
          table: "global_supplements",
          onPayload: handlePayload,
        },
      ],
      onResync: () => reloadGlobalSupplements(false),
    });
  }
  return _manager;
}

export function useGlobalSupplementsSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const manager = getGlobalSupplementsManager();
    void manager.init();
  }, [enabled]);
}

export function useGlobalSupplementsCRUD() {
  const { supplements, loading, setSupplements } = useGlobalSupplementsStore();
  
  const addSupplement = async (label: string, price: number) => {
    const { data, error } = await supabase.from("global_supplements").insert({ label, price }).select().single();
    if (error) throw new Error(error.message);
    await reloadGlobalSupplements();
    return data.id as string;
  };

  const updateSupplement = async (id: string, updates: Partial<GlobalSupplement>) => {
    setSupplements((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    const { error } = await supabase.from("global_supplements").update(updates).eq("id", id);
    if (error) {
      await reloadGlobalSupplements();
      throw new Error(error.message);
    }
  };

  const deleteSupplement = async (id: string) => {
    const { error } = await supabase.from("global_supplements").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reloadGlobalSupplements();
  };

  return { supplements, loading, addSupplement, updateSupplement, deleteSupplement };
}
