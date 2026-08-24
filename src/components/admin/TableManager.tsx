import { useState } from "react";
import { Plus, Trash2, Edit2, Grid3X3 } from "lucide-react";
import { type Table } from "@/data/tables";

// Extending Table for admin mock purposes
type AdminTable = Table & { roomId: string };
type Room = { id: string; name: string };

const initialRooms: Room[] = [];

export function TableManager() {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [tables, setTables] = useState<AdminTable[]>([]);
  
  const [activeRoom, setActiveRoom] = useState<string>(rooms[0]?.id || "");
  const [newRoomName, setNewRoomName] = useState("");
  
  // Table Form State
  const [isEditing, setIsEditing] = useState<AdminTable | null>(null);
  const [showTableForm, setShowTableForm] = useState(false);

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      const newRoom = { id: `r_${Date.now()}`, name: newRoomName.trim() };
      setRooms([...rooms, newRoom]);
      setNewRoomName("");
      if (!activeRoom) setActiveRoom(newRoom.id);
    }
  };

  const handleDeleteRoom = (id: string) => {
    setRooms(rooms.filter(r => r.id !== id));
    if (activeRoom === id) setActiveRoom(rooms[0]?.id || "");
  };

  const handleDeleteTable = (id: string) => {
    setTables(tables.filter(t => t.id !== id));
  };

  return (
    <div className="flex h-full flex-col lg:flex-row gap-6 p-6">
      {/* Rooms Sidebar */}
      <div className="w-full lg:w-64 shrink-0 flex flex-col gap-4">
        <h2 className="text-xl font-bold">Salles</h2>
        
        <form onSubmit={handleAddRoom} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Nouvelle salle..."
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button type="submit" className="grid place-items-center rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
          </button>
        </form>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {rooms.map(room => (
            <div 
              key={room.id} 
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${activeRoom === room.id ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
              onClick={() => setActiveRoom(room.id)}
            >
              <span>{room.name}</span>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tables Area */}
      <div className="flex-1 flex flex-col gap-4 bg-card rounded-xl border border-border p-5 overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Tables - {rooms.find(r => r.id === activeRoom)?.name}
          </h2>
          <button 
            onClick={() => { setIsEditing(null); setShowTableForm(true); }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            disabled={!activeRoom}
          >
            <Plus className="h-4 w-4" /> Ajouter Table
          </button>
        </div>

        {showTableForm ? (
           <TableForm 
             initialData={isEditing} 
             roomId={activeRoom}
             onSave={(tbl) => {
               if (isEditing) {
                 setTables(tables.map(t => t.id === tbl.id ? tbl : t));
               } else {
                 setTables([...tables, tbl]);
               }
               setShowTableForm(false);
             }}
             onCancel={() => setShowTableForm(false)} 
           />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto pb-4">
            {tables.filter(t => t.roomId === activeRoom).map(tbl => (
              <div key={tbl.id} className="group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-background transition-colors hover:border-primary/50">
                <Grid3X3 className="h-8 w-8 text-muted-foreground" />
                <span className="font-bold text-lg">T{tbl.number}</span>
                <span className="text-xs text-muted-foreground">{tbl.seats} places</span>
                
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button 
                    onClick={() => { setIsEditing(tbl); setShowTableForm(true); }}
                    className="grid place-items-center rounded bg-background p-1.5 shadow hover:bg-muted"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button 
                    onClick={() => handleDeleteTable(tbl.id)}
                    className="grid place-items-center rounded bg-destructive/10 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableForm({ initialData, roomId, onSave, onCancel }: { 
  initialData: AdminTable | null, 
  roomId: string,
  onSave: (t: AdminTable) => void, 
  onCancel: () => void 
}) {
  const [number, setNumber] = useState(initialData?.number?.toString() || "");
  const [seats, setSeats] = useState(initialData?.seats?.toString() || "4");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number || !seats) return;
    
    onSave({
      id: initialData?.id || `t_${Date.now()}`,
      number: parseInt(number),
      seats: parseInt(seats),
      status: initialData?.status || "libre",
      roomId
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-background p-4 border border-border max-w-md">
      <h3 className="text-lg font-semibold">{initialData ? "Modifier" : "Nouvelle"} Table</h3>
      
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
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Enregistrer
        </button>
      </div>
    </form>
  );
}
