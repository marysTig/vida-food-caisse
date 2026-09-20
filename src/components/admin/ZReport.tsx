import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { supabase } from "@/lib/supabase";

export type ZReportProduct = {
  product_name: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type DayStats = {
  totalOrders: number;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  products: ZReportProduct[];
};

async function fetchDayStats(date: Date): Promise<DayStats> {
  // Build day range from local date
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  // Récupération de l'historique des produits vendus depuis z_report_history
  const { data: historyData, error: historyError } = await supabase
    .from("z_report_history")
    .select("*")
    .gte("cashout_date", start.toISOString())
    .lte("cashout_date", end.toISOString());

  if (historyError) {
    console.error("Erreur chargement historique Z:", historyError.message);
    return { totalOrders: 0, totalRevenue: 0, totalCash: 0, totalCard: 0, products: [] };
  }

  // Agréger les produits
  const productMap = new Map<string, ZReportProduct>();
  const historyRows = (historyData ?? []) as any[];

  for (const row of historyRows) {
    // Clé d'agrégation: nom du produit + nom de la variante (ou vide) + prix unitaire
    const key = `${row.product_name}|${row.variant_name || ""}|${row.unit_price}`;

    if (productMap.has(key)) {
      const existing = productMap.get(key)!;
      existing.quantity += row.quantity;
      existing.line_total += row.line_total;
    } else {
      productMap.set(key, {
        product_name: row.product_name,
        variant_name: row.variant_name,
        unit_price: row.unit_price,
        quantity: row.quantity,
        line_total: row.line_total,
      });
    }
  }

  const products = Array.from(productMap.values()).sort((a, b) => b.line_total - a.line_total);

  return { totalOrders: 0, totalRevenue: 0, totalCash: 0, totalCard: 0, products };
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
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/40">
                <h3 className="text-lg font-bold">Produits vendus</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/20 border-b border-border">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Produit</th>
                      <th className="px-6 py-3 font-semibold">Variante</th>
                      <th className="px-6 py-3 font-semibold text-right">Qté</th>
                      <th className="px-6 py-3 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats?.products && stats.products.length > 0 ? (
                      stats.products.map((p, idx) => (
                        <tr key={idx} className="hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-3 font-medium text-foreground">{p.product_name}</td>
                          <td className="px-6 py-3 text-muted-foreground">{p.variant_name || "—"}</td>
                          <td className="px-6 py-3 text-right font-semibold">{p.quantity}</td>
                          <td className="px-6 py-3 text-right font-bold text-primary">{(p.line_total).toLocaleString("fr-FR")} DA</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                          Aucun produit vendu ce jour.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {stats?.products && stats.products.length > 0 && (
                    <tfoot className="bg-muted/40 font-bold border-t border-border">
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-right">TOTAL JOURNÉE :</td>
                        <td className="px-6 py-4 text-right text-success text-base">
                          {stats.products.reduce((sum, p) => sum + p.line_total, 0).toLocaleString("fr-FR")} DA
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
