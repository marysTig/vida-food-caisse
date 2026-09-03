import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { CartItem } from "@/lib/cart";

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

// ── Realtime initializer — singleton, called once from RootComponent ───────────

let _initialized = false;

async function _initTableOrdersSync() {
  // Ne s'exécute que dans le navigateur (jamais en SSR/Node)
  if (typeof window === "undefined") return;
  if (_initialized) return;

  try {
    // 1. Charger les commandes existantes depuis Supabase
    const { data, error } = await supabase
      .from("table_orders")
      .select("table_id, items, note");

    if (error) {
      console.error("[table_orders] initial load error:", error.message);
      return; // _initialized reste false → réessai possible au prochain mount
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
  } catch (err) {
    console.error("[table_orders] try/catch error:", err);
    return; // _initialized reste false → réessai possible
  }

  // Marquer comme initialisé seulement après un chargement réussi
  _initialized = true;

  // 2. S'abonner aux changements en temps réel
  supabase
    .channel("table-orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "table_orders" },
      (payload) => {
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
      },
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        console.error("[table_orders] Realtime channel error:", status, err);
        // Réinitialiser pour permettre une nouvelle tentative
        _initialized = false;
      }
    });
}

/**
 * Appeler ce hook UNE SEULE FOIS dans le composant racine (RootComponent).
 * Il charge les commandes depuis Supabase et active le Realtime.
 */
export function useTableOrdersSync() {
  useEffect(() => {
    _initTableOrdersSync();
  }, []);
}