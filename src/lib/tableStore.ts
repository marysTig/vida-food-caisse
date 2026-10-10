import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { type TableStatus } from "@/data/tables";
import { RealtimeManager, type PostgresPayload } from "@/lib/realtimeManager";

export type RoomItem = {
  id: string;
  name: string;
};

export type TableItem = {
  id: string;
  number: number;
  seats?: number;
  status: TableStatus;
  roomId?: string;
  orderTotal?: number;
  occupiedSince?: string;
  parentTableId?: string | null;
};

// ── Global State (Zustand) ────────────────────────────────────────
type TableGlobalState = {
  rooms: RoomItem[];
  tables: TableItem[];
  loading: boolean;
  setRooms: (rooms: RoomItem[]) => void;
  setTables: (tables: TableItem[] | ((prev: TableItem[]) => TableItem[])) => void;
  setLoading: (loading: boolean) => void;
};

export const useTableGlobalState = create<TableGlobalState>((set) => ({
  rooms: [],
  tables: [],
  loading: true,
  setRooms: (rooms) => set({ rooms }),
  setTables: (tables) => set((state) => ({
    tables: typeof tables === 'function' ? tables(state.tables) : tables
  })),
  setLoading: (loading) => set({ loading }),
}));

// ── Supabase helpers ──────────────────────────────────────────────

async function fetchRoomsFromDB(): Promise<RoomItem[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement salles:", error.message);
    // Throw (not []) so a network blip keeps the current floor plan on screen.
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row["id"] as string,
    name: row["name"] as string,
  }));
}

async function fetchTablesFromDB(): Promise<TableItem[]> {
  const { data, error } = await supabase
    .from("tables")
    .select("id, number, seats, status, room_id, order_total, occupied_since, parent_table_id, created_at")
    .order("number", { ascending: true });

  if (error) {
    console.error("Erreur chargement tables:", error.message);
    throw new Error(error.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => {
    const item: TableItem = {
      id: row["id"] as string,
      number: row["number"] as number,
      seats: row["seats"] as number,
      status: (row["status"] as TableStatus) ?? "libre",
      roomId: row["room_id"] as string,
    };
    if (row["order_total"] != null) {
      item.orderTotal = row["order_total"] as number;
    }
    if (row["occupied_since"] != null) {
      item.occupiedSince = row["occupied_since"] as string;
    }
    if (row["parent_table_id"] !== undefined) {
      item.parentTableId = row["parent_table_id"] as string | null;
    }
    return item;
  });
}

// ── Stale-snapshot protection (same idea as tableOrdersStore) ────────────────
// A full reload replaces every table. A live event — or this device's own
// optimistic update — that lands while the fetch is in flight is NEWER than the
// snapshot; applying the snapshot over it reverted a freshly validated table
// (status / total) until the next change. Tables touched after the reload began
// keep their current version; only the newest of overlapping reloads applies.
const tableTouchedAt: Record<string, number> = {};
let tableReloadSeq = 0;

function tableTouchedSince(id: string, startedAt: number): boolean {
  return (tableTouchedAt[id] ?? 0) >= startedAt;
}

export async function reloadTableStore(isInitialLoad = false) {
  const store = useTableGlobalState.getState();
  if (isInitialLoad) store.setLoading(true);
  const seq = ++tableReloadSeq;
  const startedAt = Date.now();
  try {
    const [fetchedRooms, fetchedTables] = await Promise.all([
      fetchRoomsFromDB(),
      fetchTablesFromDB(),
    ]);
    if (seq !== tableReloadSeq) return; // a newer reload supersedes this one
    store.setRooms(fetchedRooms);
    store.setTables((prev) => {
      const prevById = new Map(prev.map((t) => [t.id, t]));
      const merged: TableItem[] = [];
      const seen = new Set<string>();
      for (const fetched of fetchedTables) {
        seen.add(fetched.id);
        if (tableTouchedSince(fetched.id, startedAt)) {
          const current = prevById.get(fetched.id);
          if (current) merged.push(current); // else: deleted after the fetch began
        } else {
          merged.push(fetched);
        }
      }
      // Created after the fetch began: not in the snapshot yet.
      for (const t of prev) {
        if (!seen.has(t.id) && tableTouchedSince(t.id, startedAt)) merged.push(t);
      }
      return merged.sort((a, b) => a.number - b.number);
    });
  } catch (error) {
    console.error("Error reloading table store:", error);
    throw error;
  } finally {
    store.setLoading(false);
  }
}

// ── Payload handler (logique métier Realtime inchangée) ───────────

function handleTableRoomPayload(payload: PostgresPayload): void {
  const store = useTableGlobalState.getState();

  if (payload.table === "rooms") {
    if (payload.eventType === "DELETE") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.setRooms(store.rooms.filter(r => r.id !== (payload.old as any).id));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newRoom = { id: (payload.new as any).id, name: (payload.new as any).name };
      const exists = store.rooms.some(r => r.id === newRoom.id);
      store.setRooms(
        exists
          ? store.rooms.map(r => r.id === newRoom.id ? newRoom : r)
          : [...store.rooms, newRoom]
      );
    }
    return;
  }

  if (payload.table === "tables") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const touchedId = ((payload.eventType === "DELETE" ? payload.old : payload.new) as any)?.id;
    if (typeof touchedId === "string") tableTouchedAt[touchedId] = Date.now();
    if (payload.eventType === "DELETE") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.setTables((prev) => prev.filter(t => t.id !== (payload.old as any).id));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = payload.new as any;
      const item: TableItem = {
        id: row["id"],
        number: row["number"],
        seats: row["seats"],
        status: row["status"] ?? "libre",
        roomId: row["room_id"],
      };
      if (row["order_total"] != null) item.orderTotal = row["order_total"];
      if (row["occupied_since"] != null) item.occupiedSince = row["occupied_since"];
      if (row["parent_table_id"] !== undefined) item.parentTableId = row["parent_table_id"];

      store.setTables((prev) => {
        if (prev.some(t => t.id === item.id)) {
          return prev.map(t => t.id === item.id ? item : t);
        }
        return [...prev, item].sort((a, b) => a.number - b.number);
      });
    }
  }
}

// ── Singleton RealtimeManager pour tables+rooms ───────────────────

let _tableRoomManager: RealtimeManager | null = null;

function getTableRoomManager(): RealtimeManager {
  if (!_tableRoomManager) {
    _tableRoomManager = new RealtimeManager({
      channelName: "tables-rooms-realtime",
      listeners: [
        {
          schema: "public",
          table: "rooms",
          onPayload: handleTableRoomPayload,
        },
        {
          schema: "public",
          table: "tables",
          onPayload: handleTableRoomPayload,
        },
      ],
      onResync: () => reloadTableStore(false),
    });
  }
  return _tableRoomManager;
}

/** Exposé pour que __root.tsx puisse déclencher handleForeground() */
export function getTableRealtimeManager(): RealtimeManager {
  return getTableRoomManager();
}

// ── Hook Realtime (appelé une seule fois dans RootComponent) ──────

export function useTableSync(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const manager = getTableRoomManager();
    void manager.init();
    // Pas de destroy() ici : le manager est un singleton global qui doit
    // rester actif pendant toute la durée de vie de l'app.
  }, [enabled]);
}

// ── Hook principal ────────────────────────────────────────────────

/**
 * Optimistic update + DB write, usable without subscribing the caller to the
 * whole tables list (the order panel only needs its own table).
 */
export async function updateTableRecord(id: string, table: Partial<TableItem>): Promise<void> {
  const { setTables } = useTableGlobalState.getState();
  // Optimistic update — also protects it from an in-flight reload's older snapshot.
  tableTouchedAt[id] = Date.now();
  setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...table } : t)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {};
  if (table.number !== undefined) payload["number"] = table.number;
  if (table.seats !== undefined) payload["seats"] = table.seats;
  if (table.status !== undefined) payload["status"] = table.status;
  if (table.roomId !== undefined) payload["room_id"] = table.roomId;
  if (table.orderTotal !== undefined) payload["order_total"] = table.orderTotal;
  if (table.occupiedSince !== undefined) payload["occupied_since"] = table.occupiedSince;
  // Force null if explicitly passed as null (though typed as string, we might pass null as any to clear it)
  if (table.occupiedSince === null) payload["occupied_since"] = null;
  if (table.parentTableId !== undefined) payload["parent_table_id"] = table.parentTableId;

  const { error } = await supabase.from("tables").update(payload).eq("id", id);
  if (error) {
    console.error("Erreur updateTable:", error.message);
    // Fallback
    await reloadTableStore();
    throw new Error(error.message);
  }
  // We rely on the Supabase Realtime subscription to reload the data eventually,
  // or the optimistic state will persist until refresh.
}

export function useTableStore() {
  const { rooms, tables, loading, setTables } = useTableGlobalState();

  const reload = reloadTableStore;

  // ── CRUD Salles ─────────────────────────────────────────────────

  const addRoom = async (name: string) => {
    const { data, error } = await supabase.from("rooms").insert({ name }).select().single();
    if (error) throw new Error(error.message);
    await reload();
    return data.id as string;
  };

  const deleteRoom = async (id: string) => {
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  // ── CRUD Tables ─────────────────────────────────────────────────

  const addTable = async (table: Omit<TableItem, "id">) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: Record<string, any> = {
      number: table.number,
      status: table.status,
    };
    if (table.seats !== undefined) insertPayload["seats"] = table.seats;
    if (table.roomId) insertPayload["room_id"] = table.roomId;
    const { data, error } = await supabase.from("tables").insert(insertPayload).select().single();
    if (error) throw new Error(error.message);
    await reload();
    return data.id as string;
  };

  const updateTable = updateTableRecord;

  const deleteTable = async (id: string) => {
    const { error } = await supabase.from("tables").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  const mergeTablesDB = async (primaryId: string, otherIds: string[], totalAmountToAdd: number) => {
    const primary = tables.find(t => t.id === primaryId);
    if (primary) {
      await updateTable(primaryId, {
        orderTotal: (primary.orderTotal || 0) + totalAmountToAdd
      });
    }

    for (const id of otherIds) {
      const payload: Partial<TableItem> = {
        orderTotal: 0,
        parentTableId: primaryId
      };
      await updateTable(id, payload);
    }
  };

  return {
    rooms,
    tables,
    loading,
    reload,
    addRoom,
    deleteRoom,
    addTable,
    updateTable,
    deleteTable,
    mergeTablesDB,
  };
}
