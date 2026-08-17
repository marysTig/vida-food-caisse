import {
  ChefHat,
  ClipboardList,
  CreditCard,
  LogOut,
  Receipt,
  Settings,
  Armchair,
  BarChart3,
} from "lucide-react";

const nav = [
  { label: "Caisse", icon: Receipt, active: true },
  { label: "Tables", icon: Armchair, active: false },
  { label: "Commandes", icon: ClipboardList, active: false },
  { label: "Crédits", icon: CreditCard, active: false },
  { label: "Rapports", icon: BarChart3, active: false },
];

export function Sidebar() {
  return (
    <aside className="flex w-[76px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:w-[220px]">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary">
          <ChefHat className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="hidden truncate text-sm font-extrabold tracking-tight lg:block">
          LA VIDA FOOD
        </span>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-2 lg:px-3">
        {nav.map((item) => (
          <button
            key={item.label}
            type="button"
            className={
              item.active
                ? "flex items-center gap-3 rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground"
                : "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="hidden truncate lg:block">{item.label}</span>
          </button>
        ))}

        <div className="my-3 h-px bg-sidebar-border" />

        <button
          type="button"
          className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="hidden truncate lg:block">Paramètres</span>
        </button>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-bold">
            CA
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-sm font-semibold">Caissier</p>
            <p className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              En ligne
            </p>
          </div>
        </div>
        <button
          type="button"
          className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="hidden lg:block">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
