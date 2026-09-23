import { useState, useEffect } from "react";
import { format, endOfMonth, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, Loader2, Trash2 } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export type ZReportProduct = {
  product_name: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type ZReportSupplement = {
  id: string;
  label: string;
  quantity: number;
  revenue: number;
};

type DailyBreakdown = {
  date: string;
  orders: number;
  sales: number;
};

type DayStats = {
  totalOrders: number;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  products: ZReportProduct[];
};

type MonthStats = {
  totalSales: number;
  totalProducts: number;
  totalOrders: number;
  tableOrders: number;
  tableRevenue: number;
  takeoutOrders: number;
  takeoutRevenue: number;
  totalSupplements: number;
  products: ZReportProduct[];
  supplements: ZReportSupplement[];
  dailyBreakdown: DailyBreakdown[];
};

async function fetchDayStats(date: Date): Promise<DayStats> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const { data: historyData, error: historyError } = await supabase
    .from("z_report_history")
    .select("*")
    .gte("cashout_date", start.toISOString())
    .lte("cashout_date", end.toISOString());

  if (historyError) {
    console.error("Erreur chargement historique Z:", historyError.message);
    return { totalOrders: 0, totalRevenue: 0, totalCash: 0, totalCard: 0, products: [] };
  }

  const productMap = new Map<string, ZReportProduct>();
  const historyRows = (historyData ?? []) as any[];

  let totalRevenue = 0;
  const orderSet = new Set<string>();

  for (const row of historyRows) {
    orderSet.add(row.cashout_date);
    totalRevenue += row.line_total;

    // Ignore legacy global supplements from the product list
    if (String(row.product_id).startsWith("supp-")) continue;

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
  return { totalOrders: orderSet.size, totalRevenue, totalCash: 0, totalCard: 0, products };
}

async function fetchMonthStats(date: Date): Promise<MonthStats> {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  end.setHours(23, 59, 59, 999);

  const { data: historyData, error: historyError } = await supabase
    .from("z_report_history")
    .select("*")
    .gte("cashout_date", start.toISOString())
    .lte("cashout_date", end.toISOString());

  if (historyError) {
    console.error("Erreur chargement mensuel Z:", historyError.message);
    return {
      totalSales: 0, totalProducts: 0, totalOrders: 0,
      tableOrders: 0, tableRevenue: 0, takeoutOrders: 0, takeoutRevenue: 0,
      totalSupplements: 0, products: [], supplements: [], dailyBreakdown: []
    };
  }

  const rows = (historyData ?? []) as any[];

  let totalSales = 0;
  let totalProducts = 0;
  let tableRevenue = 0;
  let takeoutRevenue = 0;
  let totalSupplements = 0;

  const orderSet = new Set<string>();
  const tableOrderSet = new Set<string>();
  const takeoutOrderSet = new Set<string>();

  const productMap = new Map<string, ZReportProduct>();
  const supplementMap = new Map<string, ZReportSupplement>();
  const dailyMap = new Map<string, { orders: Set<string>, sales: number }>();

  for (const row of rows) {
    const cashoutDate = row.cashout_date;
    
    orderSet.add(cashoutDate);
    if (row.order_type === 'table') {
      tableOrderSet.add(cashoutDate);
      tableRevenue += row.line_total;
    } else if (row.order_type === 'emporter') {
      takeoutOrderSet.add(cashoutDate);
      takeoutRevenue += row.line_total;
    }

    totalSales += row.line_total;
    
    const isLegacySupplement = String(row.product_id).startsWith("supp-");
    if (!isLegacySupplement) {
      totalProducts += row.quantity;
      
      const pKey = `${row.product_name}|${row.variant_name || ""}|${row.unit_price}`;
      if (productMap.has(pKey)) {
        const existing = productMap.get(pKey)!;
        existing.quantity += row.quantity;
        existing.line_total += row.line_total;
      } else {
        productMap.set(pKey, {
          product_name: row.product_name,
          variant_name: row.variant_name,
          unit_price: row.unit_price,
          quantity: row.quantity,
          line_total: row.line_total,
        });
      }
    }

    if (row.supplements && Array.isArray(row.supplements)) {
      for (const sup of row.supplements) {
        totalSupplements += sup.price;
        if (supplementMap.has(sup.id)) {
          const existing = supplementMap.get(sup.id)!;
          existing.quantity += 1;
          existing.revenue += sup.price;
        } else {
          supplementMap.set(sup.id, {
            id: sup.id,
            label: sup.label,
            quantity: 1,
            revenue: sup.price
          });
        }
      }
    }

    const dayStr = cashoutDate.split('T')[0];
    if (dailyMap.has(dayStr)) {
      const existing = dailyMap.get(dayStr)!;
      existing.orders.add(cashoutDate);
      existing.sales += row.line_total;
    } else {
      dailyMap.set(dayStr, { orders: new Set([cashoutDate]), sales: row.line_total });
    }
  }

  const products = Array.from(productMap.values()).sort((a, b) => b.line_total - a.line_total);
  const supplements = Array.from(supplementMap.values()).sort((a, b) => b.revenue - a.revenue);
  
  const dailyBreakdown: DailyBreakdown[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, orders: data.orders.size, sales: data.sales }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalSales,
    totalProducts,
    totalOrders: orderSet.size,
    tableOrders: tableOrderSet.size,
    tableRevenue,
    takeoutOrders: takeoutOrderSet.size,
    takeoutRevenue,
    totalSupplements,
    products,
    supplements,
    dailyBreakdown,
  };
}

export function ZReport() {
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  
  // Daily State
  const [date, setDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [dailyStats, setDailyStats] = useState<DayStats | null>(null);
  
  // Monthly State
  const [monthDate, setMonthDate] = useState<Date>(new Date());
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (viewMode === "daily") {
      fetchDayStats(date).then((s) => {
        setDailyStats(s);
        setLoading(false);
      });
    } else {
      fetchMonthStats(monthDate).then((s) => {
        setMonthStats(s);
        setLoading(false);
      });
    }
  }, [date, monthDate, viewMode]);

  const handleDeleteDay = async () => {
    setIsDeleting(true);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { error } = await supabase
      .from("z_report_history")
      .delete()
      .gte("cashout_date", start.toISOString())
      .lte("cashout_date", end.toISOString());

    setIsDeleting(false);
    setShowDeleteConfirm(false);

    if (error) {
      toast.error("Erreur de suppression", { description: error.message });
    } else {
      toast.success("Rapport supprimé", { description: `Le rapport Z du ${format(date, 'dd/MM/yyyy')} a été supprimé avec succès.` });
      setLoading(true);
      const s = await fetchDayStats(date);
      setDailyStats(s);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4 md:p-6 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Rapport Z</h2>
          <p className="text-muted-foreground">Statistiques des commandes encaissées</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex rounded-md border border-border p-1 bg-card">
            <button
              onClick={() => setViewMode("daily")}
              className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                viewMode === "daily" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Quotidien
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                viewMode === "monthly" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Mensuel
            </button>
          </div>

          {/* Date Pickers */}
          <div className="relative">
            {viewMode === "daily" ? (
              <>
                <button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="flex w-full sm:w-auto justify-center items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
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
              </>
            ) : (
              <>
                {/* A simple native month picker works great for Month/Year selection on all devices */}
                <input
                  type="month"
                  value={format(monthDate, "yyyy-MM")}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month] = e.target.value.split("-");
                      setMonthDate(new Date(parseInt(year), parseInt(month) - 1, 1));
                    }
                  }}
                  className="flex w-full sm:w-auto h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-sm font-medium hover:bg-muted"
                />
              </>
            )}
          </div>
          
          {/* Delete Button (Daily only) */}
          {viewMode === "daily" && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading || (dailyStats?.totalOrders === 0)}
              className="flex items-center justify-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer le jour
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground border-b border-border pb-3 mb-4">Supprimer le Rapport Z</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer définitivement les données du Rapport Z pour le <strong className="text-foreground">{format(date, 'dd/MM/yyyy')}</strong> ?
              <br /><br />
              Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteDay}
                disabled={isDeleting}
                className="flex-1 flex justify-center items-center gap-2 rounded-lg bg-destructive py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Chargement du rapport…</p>
          </div>
        </div>
      ) : viewMode === "daily" ? (
        /* ================= DAILY VIEW ================= */
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Commandes</p>
              <p className="text-2xl font-bold mt-1">{dailyStats?.totalOrders || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Chiffre d'Affaires</p>
              <p className="text-2xl font-bold text-primary mt-1">{(dailyStats?.totalRevenue || 0).toLocaleString("fr-FR")} DA</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/40">
              <h3 className="text-lg font-bold">Produits vendus</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/20 border-b border-border">
                  <tr>
                    <th className="px-4 md:px-6 py-3 font-semibold">Produit</th>
                    <th className="px-4 md:px-6 py-3 font-semibold">Variante</th>
                    <th className="px-4 md:px-6 py-3 font-semibold text-right">Qté</th>
                    <th className="px-4 md:px-6 py-3 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dailyStats?.products && dailyStats.products.length > 0 ? (
                    dailyStats.products.map((p, idx) => (
                      <tr key={idx} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 md:px-6 py-3 font-medium text-foreground">{p.product_name}</td>
                        <td className="px-4 md:px-6 py-3 text-muted-foreground">{p.variant_name || "—"}</td>
                        <td className="px-4 md:px-6 py-3 text-right font-semibold">{p.quantity}</td>
                        <td className="px-4 md:px-6 py-3 text-right font-bold text-primary">{(p.line_total).toLocaleString("fr-FR")} DA</td>
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
                {dailyStats?.products && dailyStats.products.length > 0 && (
                  <tfoot className="bg-muted/40 font-bold border-t border-border">
                    <tr>
                      <td colSpan={3} className="px-4 md:px-6 py-4 text-right">TOTAL JOURNÉE :</td>
                      <td className="px-4 md:px-6 py-4 text-right text-success text-base">
                        {dailyStats.products.reduce((sum, p) => sum + p.line_total, 0).toLocaleString("fr-FR")} DA
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ================= MONTHLY VIEW ================= */
        monthStats && (
          <div className="flex flex-col gap-6">
            <h3 className="text-xl font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
              RAPPORT MENSUEL — {format(monthDate, "MMMM yyyy", { locale: fr })}
            </h3>
            
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Chiffre d'Affaires Global</p>
                <p className="text-2xl md:text-3xl font-extrabold text-primary mt-1">{(monthStats.totalSales).toLocaleString("fr-FR")} DA</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Total Commandes</p>
                <p className="text-2xl font-bold mt-1">{monthStats.totalOrders}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Produits Vendus</p>
                <p className="text-2xl font-bold mt-1">{monthStats.totalProducts}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Revenus Suppléments</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{(monthStats.totalSupplements).toLocaleString("fr-FR")} DA</p>
              </div>
            </div>

            {/* Split Table vs Takeout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-5">
                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wider">Sur Place (Table)</h4>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Commandes</p>
                    <p className="text-lg font-bold text-foreground">{monthStats.tableOrders}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Revenus</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{(monthStats.tableRevenue).toLocaleString("fr-FR")} DA</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 p-5">
                <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-3 uppercase tracking-wider">À Emporter</h4>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Commandes</p>
                    <p className="text-lg font-bold text-foreground">{monthStats.takeoutOrders}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Revenus</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{(monthStats.takeoutRevenue).toLocaleString("fr-FR")} DA</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Breakdown */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/40">
                <h3 className="text-lg font-bold">Ventes par Jour</h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 text-xs text-muted-foreground bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 md:px-6 py-3 font-semibold">Date</th>
                      <th className="px-4 md:px-6 py-3 font-semibold text-right">Commandes</th>
                      <th className="px-4 md:px-6 py-3 font-semibold text-right">Ventes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {monthStats.dailyBreakdown.length > 0 ? (
                      monthStats.dailyBreakdown.map((day, idx) => (
                        <tr key={idx} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 md:px-6 py-3 font-medium text-foreground">
                            {format(new Date(day.date), "dd/MM/yyyy")}
                          </td>
                          <td className="px-4 md:px-6 py-3 text-right font-semibold">{day.orders}</td>
                          <td className="px-4 md:px-6 py-3 text-right font-bold text-primary">{(day.sales).toLocaleString("fr-FR")} DA</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                          Aucune vente enregistrée ce mois.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Product Breakdown */}
              <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-border bg-muted/40 shrink-0">
                  <h3 className="text-lg font-bold">Détail des Produits</h3>
                </div>
                <div className="overflow-y-auto max-h-[400px] flex-1">
                  <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 text-xs text-muted-foreground bg-muted border-b border-border z-10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Produit</th>
                        <th className="px-4 py-3 font-semibold text-right">Qté</th>
                        <th className="px-4 py-3 font-semibold text-right">Revenus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {monthStats.products.length > 0 ? (
                        monthStats.products.map((p, idx) => (
                          <tr key={idx} className="hover:bg-muted/10">
                            <td className="px-4 py-3 font-medium">
                              {p.product_name}
                              {p.variant_name && <span className="block text-xs text-muted-foreground font-normal mt-0.5">- {p.variant_name}</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{p.quantity}</td>
                            <td className="px-4 py-3 text-right font-bold">{(p.line_total).toLocaleString("fr-FR")} DA</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">Vide</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Supplement Breakdown */}
              <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-border bg-muted/40 shrink-0">
                  <h3 className="text-lg font-bold">Détail des Suppléments</h3>
                </div>
                <div className="overflow-y-auto max-h-[400px] flex-1">
                  <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 text-xs text-muted-foreground bg-muted border-b border-border z-10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Supplément</th>
                        <th className="px-4 py-3 font-semibold text-right">Vendus</th>
                        <th className="px-4 py-3 font-semibold text-right">Revenus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {monthStats.supplements.length > 0 ? (
                        monthStats.supplements.map((sup, idx) => (
                          <tr key={idx} className="hover:bg-muted/10">
                            <td className="px-4 py-3 font-medium">{sup.label}</td>
                            <td className="px-4 py-3 text-right font-semibold">{sup.quantity}</td>
                            <td className="px-4 py-3 text-right font-bold text-orange-500">{(sup.revenue).toLocaleString("fr-FR")} DA</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">Aucun supplément vendu.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Bottom Month Total */}
            <div className="mt-4 rounded-xl bg-primary text-primary-foreground p-6 shadow-xl">
              <h3 className="text-lg font-bold opacity-80 uppercase tracking-widest mb-4">TOTAL DU MOIS</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold opacity-70">Commandes</p>
                  <p className="text-xl font-bold">{monthStats.totalOrders}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold opacity-70">Produits</p>
                  <p className="text-xl font-bold">{monthStats.totalProducts}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold opacity-70">Suppléments</p>
                  <p className="text-xl font-bold">{(monthStats.totalSupplements).toLocaleString("fr-FR")} DA</p>
                </div>
                <div className="text-right col-span-2 md:col-span-1 border-t border-primary-foreground/20 pt-3 md:border-none md:pt-0">
                  <p className="text-xs font-semibold opacity-70">CHIFFRE D'AFFAIRES</p>
                  <p className="text-2xl md:text-3xl font-extrabold">{(monthStats.totalSales).toLocaleString("fr-FR")} DA</p>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
