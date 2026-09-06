import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { CartItem } from "@/lib/cart";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";

// ── Types ─────────────────────────────────────────────────────────────────────

type TableOrdersState = {
  orders: Record<string, CartItem[]>;
  orderNotes: Record<string, string>;
  // Internal actions (used by realtime listener)
  _patchOrder: (tableId: string, items: CartItem[]) => void;
  _patchNote: (tableId: string, note: string) => void;
  _removeOrder: (tableId: string) => void;
  _setAll: (orders: Record<string, CartItem[]>, notes: Record<string, string>) => void;
  // Public API — identical to the previous localStorage store
  setOrder: (tableId: string, items: CartItem[]) => void;
  setOrderNote: (tableId: string, note: string) => void;
  flushOrder: (tableId: string) => Promise<void>;
  clearOrder: (tableId: string) => void;
  mergeOrders: (primaryId: string, sourceIds: string[]) => void;
};

// ── Debounced upsert — avoids flooding Supabase on every keystroke ─────────

const upsertTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleUpsert(tableId: string, items: CartItem[], note: string) {
  clearTimeout(upsertTimers[tableId]);
  upsertTimers[tableId] = setTimeout(async () => {
    const { error } = await supabase.from("table_orders").upsert(
      { table_id: tableId, items, note, updated_at: new Date().toISOString() },
      { onConflict: "table_id" },
    );
    if (error) console.error("[table_orders] upsert error:", error.message);
  }, 300);
}

async function deleteFromDB(tableId: string) {
  clearTimeout(upsertTimers[tableId]);
  const { error } = await supabase
    .from("table_orders")
    .delete()
    .eq("table_id", tableId);
  if (error) console.error("[table_orders] delete error:", error.message);
}

// ── Zustand store ─────────────────────────────────────────────────────────────

export const useTableOrdersStore = create<TableOrdersState>((set, get) => ({
  orders: {},
  orderNotes: {},

  // ── Internal ──────────────────────────────────────────────────────────────

  _setAll: (orders, notes) => set({ orders, orderNotes: notes }),

  _patchOrder: (tableId, items) =>
    set((state) => ({ orders: { ...state.orders, [tableId]: items } })),

  _patchNote: (tableId, note) =>
    set((state) => ({ orderNotes: { ...state.orderNotes, [tableId]: note } })),

  _removeOrder: (tableId) =>
    set((state) => {
      const orders = { ...state.orders };
      const orderNotes = { ...state.orderNotes };
      delete orders[tableId];
      delete orderNotes[tableId];
      return { orders, orderNotes };
    }),

  // ── Public API ────────────────────────────────────────────────────────────

  setOrder: (tableId, items) => {
    const note = get().orderNotes[tableId] ?? "";
    set((s) => ({ orders: { ...s.orders, [tableId]: items } }));
    scheduleUpsert(tableId, items, note);
  },

  setOrderNote: (tableId, note) => {
    const items = get().orders[tableId] ?? [];
    set((s) => ({ orderNotes: { ...s.orderNotes, [tableId]: note } }));
    scheduleUpsert(tableId, items, note);
  },

  // Upsert immédiat (sans debounce) — à appeler au moment de valider une commande
  // pour s'assurer que les données sont dans Supabase avant que la Caisse encaisse.
  flushOrder: async (tableId) => {
    clearTimeout(upsertTimers[tableId]);
    const items = get().orders[tableId] ?? [];
    const note = get().orderNotes[tableId] ?? "";
    const { error } = await supabase.from("table_orders").upsert(
      { table_id: tableId, items, note, updated_at: new Date().toISOString() },
      { onConflict: "table_id" },
    );
    if (error) console.error("[table_orders] flushOrder error:", error.message);
  },

  clearOrder: (tableId) => {
    set((state) => {
      const orders = { ...state.orders };
      const orderNotes = { ...state.orderNotes };
      delete orders[tableId];
      delete orderNotes[tableId];
      return { orders, orderNotes };
    });
    deleteFromDB(tableId);
  },

  mergeOrders: (primaryId, sourceIds) => {
    set((state) => {
      const newOrders = { ...state.orders };
      const newNotes = { ...state.orderNotes };
      let combinedItems = [...(newOrders[primaryId] || [])];
      const noteParts: string[] = [];

      if (newNotes[primaryId]) noteParts.push(newNotes[primaryId]);

      for (const id of sourceIds) {
        if (newOrders[id]) {
          combinedItems = [...combinedItems, ...newOrders[id]];
          delete newOrders[id];
        }
        if (newNotes[id]) {
          noteParts.push(newNotes[id]);
          delete newNotes[id];
        }
      }

      newOrders[primaryId] = combinedItems;
      const mergedNote = noteParts.join(" | ");
      if (mergedNote) newNotes[primaryId] = mergedNote;

      // Sync to Supabase
      scheduleUpsert(primaryId, newOrders[primaryId], newNotes[primaryId] ?? "");
      for (const id of sourceIds) deleteFromDB(id);

      return { orders: newOrders, orderNotes: newNotes };
    });
  },
}));

// ── Resync depuis Supabase ─────────────────────────────────────────────────────

async function resyncTableOrders(): Promise<void> {
  const { data, error } = await supabase
    .from("table_orders")
    .select("table_id, items, note");

  if (error) {
    console.error("[table_orders] resync error:", error.message);
    throw error;
  }

  const orders: Record<string, CartItem[]> = {};
  const notes: Record<string, string> = {};
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders[(row as any).table_id] = (row as any).items as CartItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notes[(row as any).table_id] = (row as any).note ?? "";
  }
  useTableOrdersStore.getState()._setAll(orders, notes);
}

// ── Payload handler (logique métier Realtime inchangée) ───────────────────────

function handleTableOrderPayload(payload: PostgresPayload): void {
  const store = useTableOrdersStore.getState();
  if (payload.eventType === "DELETE") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store._removeOrder((payload.old as any).table_id);
  } else {
    // INSERT or UPDATE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = payload.new as any;
    store._patchOrder(row.table_id, row.items as CartItem[]);
    store._patchNote(row.table_id, row.note ?? "");
  }
}

// ── Singleton RealtimeManager pour table_orders ────────────────────────────────

let _tableOrdersManager: RealtimeManager | null = null;

function getTableOrdersManager(): RealtimeManager {
  if (!_tableOrdersManager) {
    _tableOrdersManager = new RealtimeManager({
      channelName: "table-orders-realtime",
      listeners: [
        {
          schema: "public",
          table: "table_orders",
          onPayload: handleTableOrderPayload,
        },
      ],
      onResync: resyncTableOrders,
    });
  }
  return _tableOrdersManager;
}

/** Exposé pour que __root.tsx puisse déclencher handleForeground() */
export function getTableOrdersRealtimeManager(): RealtimeManager {
  return getTableOrdersManager();
}

/**
 * Appeler ce hook UNE SEULE FOIS dans le composant racine (RootComponent).
 * Il charge les commandes depuis Supabase et active le Realtime.
 */
export function useTableOrdersSync() {
  useEffect(() => {
    const manager = getTableOrdersManager();
    void manager.init();
    // Pas de destroy() ici : le manager est un singleton global qui doit
    // rester actif pendant toute la durée de vie de l'app.
  }, []);
}