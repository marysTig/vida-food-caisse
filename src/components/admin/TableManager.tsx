import { useState } from "react";
import { Plus, Trash2, Edit2, Grid3X3, Loader2 } from "lucide-react";
import { useTableStore, type RoomItem, type TableItem } from "@/lib/tableStore";

export function TableManager() {
  const {
    rooms,
    tables,
    loading,
    addRoom,
    deleteRoom,
    addTable,
    updateTable,
    deleteTable,
  } = useTableStore();

  const [activeRoom, setActiveRoom] = useState<string>("");
  const [newRoomName, setNewRoomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminRooms = rooms.filter((r) => r.name.toLowerCase() !== "emporter");
  const effectiveActiveRoom = adminRooms.some(r => r.id === activeRoom) ? activeRoom : (adminRooms[0]?.id || "");

  // Table Form State
  const [isEditing, setIsEditing] = useState<TableItem | null>(null);
  const [showTableForm, setShowTableForm] = useState(false);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addRoom(newRoomName.trim());
      setNewRoomName("");
    } catch (err: any) {
      setError(err.message ?? "Erreur lors de l'ajout de la salle");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await deleteRoom(id);
      if (activeRoom === id) setActiveRoom("");
    } catch (err: any) {
      setError(err.message ?? "Erreur lors de la suppression");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await deleteTable(id);
    } catch (err: any) {
      setError(err.message ?? "Erreur lors de la suppression");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden bg-background">
      {/* Room selector (Header + Horizontal Row) */}
      <div className="w-full shrink-0 border-b border-border bg-card flex flex-col">
        {/* Header Area with Form */}
        <div className="flex flex-col items-center justify-center gap-3 px-5 pt-6 pb-2">
          <h2 className="text-xl font-bold">Salles</h2>
          <form onSubmit={handleAddRoom} className="flex shrink-0 items-center justify-center gap-2 w-full max-w-xs">
            <input
              type="text"
              required
              placeholder="Nouvelle salle..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary shadow-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Horizontal Row with Circles */}
        <div className="flex items-center justify-center gap-4 overflow-x-auto px-5 py-4 no-scrollbar">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : adminRooms.length === 0 ? (
            <p className="px-4 text-xs text-muted-foreground py-2">Aucune salle. Ajoutez-en une pour commencer.</p>
          ) : (
            adminRooms.map(room => (
              <div
                key={room.id}
                className={`group relative flex shrink-0 flex-col items-center gap-2 transition-all ${effectiveActiveRoom === room.id ? "opacity-100 scale-105" : "opacity-70 hover:opacity-100"}`}
              >
                <button
                  onClick={() => setActiveRoom(room.id)}
                  className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 transition-colors ${effectiveActiveRoom === room.id ? "border-primary shadow-md" : "border-border bg-muted group-hover:border-primary/50"}`}
                >
                  <span className="text-sm font-bold uppercase">{room.name.substring(0, 2)}</span>
                </button>
                <span className={`text-xs font-medium ${effectiveActiveRoom === room.id ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {room.name}
                </span>

                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground transition-opacity"
                  title="Supprimer la salle"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tables Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-center border-b border-border bg-card px-5 py-3">
          <button
            type="button"
            onClick={() => {
              if (adminRooms.length === 0) {
                alert("Veuillez d'abord ajouter une salle avant d'ajouter une table.");
                return;
              }
              setIsEditing(null);
              setShowTableForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Ajouter Table
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {showTableForm ? (
            <TableForm
              initialData={isEditing}
              activeRoomId={effectiveActiveRoom}
              rooms={adminRooms}
              onSave={async (tbl) => {
                setSaving(true);
                setError(null);
                try {
                  if (isEditing) {
                    await updateTable(isEditing.id, tbl);
                  } else {
                    const { id: _id, ...rest } = tbl;
                    await addTable(rest);
                  }
                  setShowTableForm(false);
                  setIsEditing(null);
                } catch (err: any) {
                  setError(err.message ?? "Erreur lors de la sauvegarde");
                } finally {
                  setSaving(false);
                }
              }}
              onCancel={() => { setShowTableForm(false); setIsEditing(null); }}
              saving={saving}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 pb-4">
              {tables.filter(t => t.roomId === effectiveActiveRoom).map(tbl => {
                const roomName = rooms.find(r => r.id === tbl.roomId)?.name || "Salle Inconnue";
                return (
                  <div key={tbl.id} className="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-background p-4 transition-colors hover:border-primary/50 aspect-square">
                    <Grid3X3 className="h-8 w-8 text-muted-foreground" />
                    <span className="font-bold text-lg">T{tbl.number}</span>
                    <div className="flex flex-col items-center gap-0.5 text-center">
                      <span className="text-xs text-muted-foreground">{tbl.seats} places</span>
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1">
                        {roomName}
                      </span>
                    </div>

                    <div className="absolute right-2 top-2 flex gap-1">
                      <button
                        onClick={() => { setIsEditing(tbl); setShowTableForm(true); }}
                        className="grid place-items-center rounded-md bg-muted/50 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Modifier"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTable(tbl.id)}
                        className="grid place-items-center rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {tables.filter(t => t.roomId === effectiveActiveRoom).length === 0 && effectiveActiveRoom && (
                <p className="col-span-full text-sm text-muted-foreground">Aucune table dans cette salle.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableForm({
  initialData,
  activeRoomId,
  rooms,
  onSave,
  onCancel,
  saving,
}: {
  initialData: TableItem | null,
  activeRoomId: string,
  rooms: RoomItem[],
  onSave: (t: TableItem) => void,
  onCancel: () => void,
  saving: boolean,
}) {
  const [number, setNumber] = useState(initialData?.number?.toString() || "");
  const [seats, setSeats] = useState(initialData?.seats?.toString() || "4");
  const defaultRoom = initialData?.roomId || activeRoomId || rooms[0]?.id || "";
  const [selectedRoom, setSelectedRoom] = useState(defaultRoom);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number || !seats || !selectedRoom) return;

    onSave({
      id: initialData?.id || `t_${Date.now()}`,
      number: parseInt(number),
      seats: parseInt(seats),
      status: initialData?.status || "libre",
      roomId: selectedRoom,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-background p-4 border border-border max-w-md">
      <h3 className="text-lg font-semibold">{initialData ? "Modifier" : "Nouvelle"} Table</h3>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Salle</label>
        <select
          value={selectedRoom}
          onChange={(e) => setSelectedRoom(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {rooms.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Numéro de la table</label>
        <input
          autoFocus
          required
          type="number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Nombre de places</label>
        <input
          required
          type="number"
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium hover:bg-muted">
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </form>
  );
}
