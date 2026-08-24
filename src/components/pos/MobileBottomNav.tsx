import { Armchair, BarChart3, Utensils } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

const nav = [
  { label: "Tables",                icon: Armchair,  to: "/tables" },
  { label: "Menu",                  icon: Utensils,  to: "/" },
  { label: "Rapport",               icon: BarChart3, to: "/rapports" },
];

type MobileBottomNavProps = {
  activePage?: string;
};

export function MobileBottomNav(_props: MobileBottomNavProps) {
  const location = useRouterState({ select: s => s.location.pathname });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-10 border-t border-border bg-sidebar px-2 pb-safe pt-2 md:hidden">
      {nav.map((item) => {
        const active = location === item.to;
        return (
          <Link
            key={item.label}
            to={item.to}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
              active ? "text-primary" : "text-sidebar-foreground/50"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
