import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, TrendingUp, CreditCard, Banknote, Receipt } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

// Mock data generator for statistics
const generateMockStats = (date: Date) => {
  // Use date to seed a predictable "random" value just for visual variety
  const seed = date.getDate() + date.getMonth() * 31;
  const totalOrders = 45 + (seed % 30);
  const totalCash = (15000 + (seed * 500)) % 40000;
  const totalCard = (5000 + (seed * 200)) % 15000;
  
  return {
    totalOrders,
    totalRevenue: totalCash + totalCard,
    totalCash,
    totalCard,
  };
};

export function ZReport() {
  const [date, setDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  
  const stats = generateMockStats(date);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Chiffre d'Affaires" 
          value={`${stats.totalRevenue.toLocaleString("fr-FR")} DA`} 
          icon={<TrendingUp className="h-5 w-5 text-primary" />} 
        />
        <StatCard 
          title="Commandes Encaissées" 
          value={stats.totalOrders.toString()} 
          icon={<Receipt className="h-5 w-5 text-blue-500" />} 
        />
        <StatCard 
          title="Paiements Espèces" 
          value={`${stats.totalCash.toLocaleString("fr-FR")} DA`} 
          icon={<Banknote className="h-5 w-5 text-green-500" />} 
        />
        <StatCard 
          title="Paiements Carte" 
          value={`${stats.totalCard.toLocaleString("fr-FR")} DA`} 
          icon={<CreditCard className="h-5 w-5 text-orange-500" />} 
        />
      </div>

      <div className="flex-1 rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center text-muted-foreground">
        <TrendingUp className="h-12 w-12 opacity-20 mb-4" />
        <p>Les graphiques détaillés seront disponibles après l'intégration de Supabase.</p>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
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
