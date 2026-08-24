import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Armchair, Users, Clock, CheckCircle2, Ban, CircleDot } from "lucide-react";
import { Sidebar } from "@/components/pos/Sidebar";
import { MobileBottomNav } from "@/components/pos/MobileBottomNav";
import { tables as initialTables, formatElapsed, type Table, type TableStatus } from "@/data/tables";
import { formatDA } from "@/data/menu";

export const Route = createFileRoute("/tables")({
  head: () => ({
    meta: [{ title: "Tables — La Vida Food" }],
  }),
  component: TablesPage,
});

const statusConfig: Record<TableStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  libre:    { label: "Libre",    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
  occupee:  { label: "Occupée", color: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-50 dark:bg-orange-950/40",   border: "border-orange-200 dark:border-orange-800",   dot: "bg-orange-500" },
  reservee: { label: "Réservée",color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-950/40",       border: "border-blue-200 dark:border-blue-800",       dot: "bg-blue-500" },
};

const filters: { label: string; value: TableStatus | "toutes" }[] = [
  { label: "Toutes", value: "toutes" },
  { label: "Libres", value: "libre" },
  { label: "Occupées", value: "occupee" },
  { label: "Réservées", value: "reservee" },
];

function TableCard({ table, onStatusChange }: { table: Table; onStatusChange: (id: string, status: TableStatus) => void }) {
  const cfg = statusConfig[table.status];
  return (
    <div className={`relative flex flex-col gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-md ${cfg.bg} ${cfg.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Table</p>
          <p className="text-2xl font-extrabold text-foreground leading-none">{table.number}</p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.color} bg-white/60 dark:bg-black/20 border ${cfg.border}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Seats */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{table.seats} places</span>
      </div>

      {/* Occupied info */}
      {table.status === "occupee" && table.occupiedSince && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatElapsed(table.occupiedSince)}</span>
          </div>
          {table.orderTotal !== undefined && (
            <p className="text-sm font-bold text-foreground">{formatDA(table.orderTotal)}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {table.status === "libre" && (
          <>
            <button
              onClick={() => onStatusChange(table.id, "occupee")}
              className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
            >
              Ouvrir
            </button>
            <button
              onClick={() => onStatusChange(table.id, "reservee")}
              className="flex-1 rounded-lg border border-border bg-background py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              Réserver
            </button>
          </>
        )}
        {table.status === "occupee" && (
          <Link
            to="/"
            className="flex-1 rounded-lg bg-primary py-2 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
          >
            Voir commande
          </Link>
        )}
        {table.status === "reservee" && (
          <>
            <button
              onClick={() => onStatusChange(table.id, "occupee")}
              className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
            >
              Placer
            </button>
            <button
              onClick={() => onStatusChange(table.id, "libre")}
              className="flex-1 rounded-lg border border-border bg-background py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              Annuler
            </button>
          </>
        )}
        {table.status !== "libre" && (
          <button
            onClick={() => onStatusChange(table.id, "libre")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive active:scale-95"
            title="Libérer la table"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function TablesPage() {
  const [tableData, setTableData] = useState<Table[]>(initialTables);
  const [filter, setFilter] = useState<TableStatus | "toutes">("toutes");

  const libre    = tableData.filter(t => t.status === "libre").length;
  const occupee  = tableData.filter(t => t.status === "occupee").length;
  const reservee = tableData.filter(t => t.status === "reservee").length;

  const visible = filter === "toutes" ? tableData : tableData.filter(t => t.status === filter);

  const handleStatusChange = (id: string, status: TableStatus) => {
    setTableData(prev =>
      prev.map(t =>
        t.id === id
          ? {
              ...t,
              status,
              occupiedSince: status === "occupee" ? new Date().toISOString() : undefined,
              orderTotal: status === "occupee" ? 0 : undefined,
            }
          : t,
      ),
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans">
      <Sidebar activePage="tables" />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Armchair className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Tables</h1>
            <p className="text-xs text-muted-foreground">Plan de salle</p>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 border-b border-border bg-card px-4 py-3">
          <div className="text-center">
            <p className="text-xl font-extrabold text-emerald-600">{libre}</p>
            <p className="text-[11px] text-muted-foreground">Libres</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-extrabold text-orange-500">{occupee}</p>
            <p className="text-[11px] text-muted-foreground">Occupées</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-extrabold text-blue-500">{reservee}</p>
            <p className="text-[11px] text-muted-foreground">Réservées</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card px-4 pb-3 pt-2 scrollbar-none">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map(table => (
              <TableCard key={table.id} table={table} onStatusChange={handleStatusChange} />
            ))}
          </div>
        </main>
      </div>

      <MobileBottomNav activePage="tables" />
    </div>
  );
}
