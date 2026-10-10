import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { CartItem } from "@/lib/cart";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type TableOrdersState = {
  orders: Record<string, CartItem[]>;
  orderNotes: Record<string, string>;
  orderSupplements: Record<string, GlobalSupplement[]>;
  // Internal actions (used by realtime listener)
  _patchOrder: (tableId: string, items: CartItem[]) => void;
  _patchNote: (tableId: string, note: string) => void;
  _patchSupplements: (tableId: string, supplements: GlobalSupplement[]) => void;
  _removeOrder: (tableId: string) => void;
  _setAll: (
    orders: Record<string, CartItem[]>, 
    notes: Record<string, string>,
    supplements: Record<string, GlobalSupplement[]>
  ) => void;
  // Public API — identical to the previous localStorage store
  setOrder: (tableId: string, items: CartItem[]) => void;
  setOrderNote: (tableId: string, note: string) => void;
  setOrderSupplements: (tableId: string, supplements: GlobalSupplement[]) => void;
  /** @returns false when the save failed (callers that must not proceed check it). */
  flushOrder: (tableId: string) => Promise<boolean>;
  clearOrder: (tableId: string) => void;
  mergeOrders: (primaryId: string, sourceIds: string[]) => void;
};

// ── Debounced upsert — avoids flooding Supabase on every keystroke ─────────

const upsertTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

// ── Echo protection ──────────────────────────────────────────────────────────
// Every edit is saved after 300ms and comes back through Realtime. An echo of an
// OLDER save could land after a NEWER local edit and overwrite it — items
// flickered and vanished while taking an order. While this device has a save
// scheduled or in flight for a table, incoming rows for that table are ignored
// (our newer save follows); afterwards, echoes of our own superseded saves are
// recognised by their updated_at and ignored too.
const inFlight: Record<string, number> = {};
const sentStamps: Record<string, number[]> = {};

// ── Stale-snapshot protection ────────────────────────────────────────────────
// A full reload (reconnect, foreground, first load) fetches every order, then
// REPLACES the store. If a live event for a table lands while that fetch is in
// flight, the snapshot is older than the event — applying it dropped the new
// order, and the Caisse saw the table without its items (0 DA) until something
// else changed. Remember when each table last got a live event; a reload keeps
// the live version of any table touched after the reload began, and only the
// newest of overlapping reloads is applied.
const liveEventAt: Record<string, number> = {};
let resyncSeq = 0;

function touchedSince(tableId: string, startedAt: number): boolean {
  return (liveEventAt[tableId] ?? 0) >= startedAt;
}

function hasLocalPendingWrite(tableId: string): boolean {
  return upsertTimers[tableId] !== undefined || (inFlight[tableId] ?? 0) > 0;
}

function isStaleOwnEcho(tableId: string, updatedAt: unknown): boolean {
  const stamps = sentStamps[tableId];
  if (!stamps || stamps.length === 0 || typeof updatedAt !== "string") return false;
  const at = Date.parse(updatedAt);
  const latest = stamps[stamps.length - 1]!;
  return stamps.includes(at) && at < latest;
}

async function writeOrder(
  tableId: string,
  items: CartItem[],
  note: string,
  globalSupplements: GlobalSupplement[],
  label: string,
): Promise<boolean> {
  const now = Date.now();
  const stamps = (sentStamps[tableId] ??= []);
  stamps.push(now);
  if (stamps.length > 20) stamps.shift();
  inFlight[tableId] = (inFlight[tableId] ?? 0) + 1;
  try {
    const { error } = await supabase.from("table_orders").upsert(
      {
        table_id: tableId,
        items,
        note,
        global_supplements: globalSupplements,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "table_id" },
    );
    if (error) {
      console.error(`[table_orders] ${label} error:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[table_orders] ${label} exception:`, err);
    return false;
  } finally {
    inFlight[tableId] = Math.max(0, (inFlight[tableId] ?? 1) - 1);
  }
}

function cancelScheduledUpsert(tableId: string) {
  clearTimeout(upsertTimers[tableId]);
  upsertTimers[tableId] = undefined;
}

function scheduleUpsert(tableId: string, items: CartItem[], note: string, globalSupplements: GlobalSupplement[]) {
  clearTimeout(upsertTimers[tableId]);
  upsertTimers[tableId] = setTimeout(() => {
    upsertTimers[tableId] = undefined;
    void writeOrder(tableId, items, note, globalSupplements, "upsert");
  }, 300);
}

async function deleteFromDB(tableId: string) {
  cancelScheduledUpsert(tableId);
  // A failed delete left the finished order attached to the table (leftover
  // items for the next customer). Retry through short network blips; the DB
  // trigger tables_clear_order_on_free is the final guarantee.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { error } = await supabase
      .from("table_orders")
      .delete()
      .eq("table_id", tableId);
    if (!error) return;
    console.error(`[table_orders] delete error (attempt ${attempt}/5):`, error.message);
    if (attempt < 5) await new Promise((r) => setTimeout(r, attempt * 1000));
  }
}

// ── Zustand store ─────────────────────────────────────────────────────────────

export const useTableOrdersStore = create<TableOrdersState>((set, get) => ({
  orders: {},
  orderNotes: {},
  orderSupplements: {},

  // ── Internal ──────────────────────────────────────────────────────────────

  _setAll: (orders, notes, supplements) => set({ orders, orderNotes: notes, orderSupplements: supplements }),

  _patchOrder: (tableId, items) =>
    set((state) => ({ orders: { ...state.orders, [tableId]: items } })),

  _patchNote: (tableId, note) =>
    set((state) => ({ orderNotes: { ...state.orderNotes, [tableId]: note } })),

  _patchSupplements: (tableId, supplements) =>
    set((state) => ({ orderSupplements: { ...state.orderSupplements, [tableId]: supplements } })),

  _removeOrder: (tableId) =>
    set((state) => {
      const orders = { ...state.orders };
      const orderNotes = { ...state.orderNotes };
      const orderSupplements = { ...state.orderSupplements };
      delete orders[tableId];
      delete orderNotes[tableId];
      delete orderSupplements[tableId];
      return { orders, orderNotes, orderSupplements };
    }),

  // ── Public API ────────────────────────────────────────────────────────────

  setOrder: (tableId, items) => {
    const note = get().orderNotes[tableId] ?? "";
    const supplements = get().orderSupplements[tableId] ?? [];
    set((s) => ({ orders: { ...s.orders, [tableId]: items } }));
    scheduleUpsert(tableId, items, note, supplements);
  },

  setOrderNote: (tableId, note) => {
    const items = get().orders[tableId] ?? [];
    const supplements = get().orderSupplements[tableId] ?? [];
    set((s) => ({ orderNotes: { ...s.orderNotes, [tableId]: note } }));
    scheduleUpsert(tableId, items, note, supplements);
  },

  setOrderSupplements: (tableId, supplements) => {
    const items = get().orders[tableId] ?? [];
    const note = get().orderNotes[tableId] ?? "";
    set((s) => ({ orderSupplements: { ...s.orderSupplements, [tableId]: supplements } }));
    scheduleUpsert(tableId, items, note, supplements);
  },

  // Upsert immédiat (sans debounce) — à appeler au moment de valider une commande
  // pour s'assurer que les données sont dans Supabase avant que la Caisse encaisse.
  flushOrder: async (tableId) => {
    cancelScheduledUpsert(tableId);
    const items = get().orders[tableId] ?? [];
    const note = get().orderNotes[tableId] ?? "";
    const supplements = get().orderSupplements[tableId] ?? [];
    return writeOrder(tableId, items, note, supplements, "flushOrder");
  },

  clearOrder: (tableId) => {
    set((state) => {
      const orders = { ...state.orders };
      const orderNotes = { ...state.orderNotes };
      const orderSupplements = { ...state.orderSupplements };
      delete orders[tableId];
      delete orderNotes[tableId];
      delete orderSupplements[tableId];
      return { orders, orderNotes, orderSupplements };
    });
    deleteFromDB(tableId);
  },

  mergeOrders: (primaryId, sourceIds) => {
    set((state) => {
      const newOrders = { ...state.orders };
      const newNotes = { ...state.orderNotes };
      const newSupplements = { ...state.orderSupplements };
      
      let combinedItems = [...(newOrders[primaryId] || [])];
      const noteParts: string[] = [];
      let combinedSupplements = [...(newSupplements[primaryId] || [])];

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
        if (newSupplements[id]) {
          combinedSupplements = [...combinedSupplements, ...newSupplements[id]];
          delete newSupplements[id];
        }
      }

      // Deduplicate supplements based on id
      const seen = new Set<string>();
      combinedSupplements = combinedSupplements.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      newOrders[primaryId] = combinedItems;
      const mergedNote = noteParts.join(" | ");
      if (mergedNote) newNotes[primaryId] = mergedNote;
      if (combinedSupplements.length > 0) newSupplements[primaryId] = combinedSupplements;

      // Sync to Supabase
      scheduleUpsert(primaryId, newOrders[primaryId], newNotes[primaryId] ?? "", newSupplements[primaryId] ?? []);
      for (const id of sourceIds) deleteFromDB(id);

      return { orders: newOrders, orderNotes: newNotes, orderSupplements: newSupplements };
    });
  },
}));

// ── Resync depuis Supabase ─────────────────────────────────────────────────────

async function resyncTableOrders(): Promise<void> {
  const seq = ++resyncSeq;
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from("table_orders")
    .select("table_id, items, note, global_supplements");

  if (error) {
    console.error("[table_orders] resync error:", error.message);
    throw error;
  }
  // A newer reload started while this one was fetching — its result wins.
  if (seq !== resyncSeq) return;

  const orders: Record<string, CartItem[]> = {};
  const notes: Record<string, string> = {};
  const supplements: Record<string, GlobalSupplement[]> = {};
  // Keep this device's unsaved edits, and any order a live event touched after
  // this fetch began — the snapshot predates both.
  const local = useTableOrdersStore.getState();
  const keepLocal = (tableId: string) =>
    hasLocalPendingWrite(tableId) || touchedSince(tableId, startedAt);
  for (const tableId of Object.keys(local.orders)) {
    if (!keepLocal(tableId)) continue;
    orders[tableId] = local.orders[tableId] ?? [];
    notes[tableId] = local.orderNotes[tableId] ?? "";
    supplements[tableId] = local.orderSupplements[tableId] ?? [];
  }
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (keepLocal((row as any).table_id)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders[(row as any).table_id] = (row as any).items as CartItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notes[(row as any).table_id] = (row as any).note ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supplements[(row as any).table_id] = ((row as any).global_supplements as GlobalSupplement[]) ?? [];
  }
  useTableOrdersStore.getState()._setAll(orders, notes, supplements);
}

// ── Payload handler (logique métier Realtime inchangée) ───────────────────────

/**
 * Load one table's order from Supabase into the store — used when a device opens
 * an occupied table (server tablets included) so it never starts from an empty
 * cart and then overwrites the saved order with a single new line.
 * Live data wins: skipped when this device has unsaved edits for the table, or a
 * live event arrived while the request was in flight.
 * @returns true when the table has a saved order (stop retrying), false otherwise.
 */
export async function loadOrderFromDB(tableId: string): Promise<boolean> {
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from("table_orders")
    .select("items, note, global_supplements")
    .eq("table_id", tableId)
    .maybeSingle();
  if (error) {
    console.error("[table_orders] loadOrderFromDB error:", error.message);
    return false;
  }
  const items = (data?.items as CartItem[] | null | undefined) ?? [];
  if (!data || items.length === 0) return false;
  if (hasLocalPendingWrite(tableId) || touchedSince(tableId, startedAt)) return true;

  const store = useTableOrdersStore.getState();
  store._patchOrder(tableId, items);
  store._patchNote(tableId, data.note ?? "");
  store._patchSupplements(
    tableId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data as any).global_supplements as GlobalSupplement[] | null) ?? [],
  );
  return true;
}

function handleTableOrderPayload(payload: PostgresPayload): void {
  const store = useTableOrdersStore.getState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventTableId = ((payload.eventType === "DELETE" ? payload.old : payload.new) as any)?.table_id;
  if (typeof eventTableId === "string") liveEventAt[eventTableId] = Date.now();
  if (payload.eventType === "DELETE") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableId = (payload.old as any).table_id as string;
    // Checkout / cancel elsewhere wins: drop our scheduled save so it cannot
    // resurrect the order on a freed table.
    cancelScheduledUpsert(tableId);
    store._removeOrder(tableId);
  } else {
    // INSERT or UPDATE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = payload.new as any;
    if (hasLocalPendingWrite(row.table_id) || isStaleOwnEcho(row.table_id, row.updated_at)) {
      return;
    }
    store._patchOrder(row.table_id, row.items as CartItem[]);
    store._patchNote(row.table_id, row.note ?? "");
    store._patchSupplements(row.table_id, row.global_supplements ?? []);
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
export function useTableOrdersSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const manager = getTableOrdersManager();
    void manager.init();
    // Pas de destroy() ici : le manager est un singleton global qui doit
    // rester actif pendant toute la durée de vie de l'app.
  }, [enabled]);
}