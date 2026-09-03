import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, TrendingUp, CreditCard, Banknote, Receipt, Loader2 } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { supabase } from "@/lib/supabase";

type DayStats = {
  totalOrders: number;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
};

async function fetchDayStats(date: Date): Promise<DayStats> {
  // Build day range in UTC from the local date
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("orders")
    .select("total, payment_method")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .eq("status", "paid");

  if (error) {
    console.error("Erreur chargement rapport Z:", error.message);
    return { totalOrders: 0, totalRevenue: 0, totalCash: 0, totalCard: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const totalOrders = rows.length;
  const totalCash = rows
    .filter((r) => r["payment_method"] === "cash")
    .reduce((acc: number, r) => acc + (r["total"] as number), 0);
  const totalCard = rows
    .filter((r) => r["payment_method"] === "card")
    .reduce((acc: number, r) => acc + (r["total"] as number), 0);
  const totalRevenue = totalCash + totalCard;

  return { totalOrders, totalRevenue, totalCash, totalCard };
}

export function ZReport() {
  const [date, setDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchDayStats(date).then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, [date]);

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Rapport Z</h2>
          <p className="text-muted-foreground">Statistiques des commandes encaissées</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <CalendarIcon className="h-4 w-4" />
            {format(date, "EEEE d MMMM yyyy", { locale: fr })}
          </button>

          {showCalendar && (
            <div className="absolute right-0 top-12 z-50 rounded-lg border border-border bg-card p-3 shadow-xl">
              <DayPicker
                mode="single"
                selected={date}
                onSelect={(d) => { if (d) setDate(d); setShowCalendar(false); }}
                locale={fr}
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Chargement du rapport…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Chiffre d'Affaires"
              value={`${(stats?.totalRevenue ?? 0).toLocaleString("fr-FR")} DA`}
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
            />
            <StatCard
              title="Commandes Encaissées"
              value={(stats?.totalOrders ?? 0).toString()}
              icon={<Receipt className="h-5 w-5 text-blue-500" />}
            />
            <StatCard
              title="Paiements Espèces"
              value={`${(stats?.totalCash ?? 0).toLocaleString("fr-FR")} DA`}
              icon={<Banknote className="h-5 w-5 text-green-500" />}
            />
            <StatCard
              title="Paiements Carte"
              value={`${(stats?.totalCard ?? 0).toLocaleString("fr-FR")} DA`}
              icon={<CreditCard className="h-5 w-5 text-orange-500" />}
            />
          </div>

          <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 opacity-20 mb-4" />
            <p>
              {stats?.totalOrders === 0
                ? "Aucune commande encaissée ce jour."
                : "Les graphiques détaillés seront disponibles prochainement."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
