import type { Category } from "@/data/menu";

type CategoryTabsProps = {
  active: Category;
  onChange: (category: Category) => void;
  categories: string[]; // liste dynamique : ["Tous", "Pizzas", ...]
};

export function CategoryTabs({ active, onChange, categories }: CategoryTabsProps) {
  return (
    <div className="flex overflow-x-auto gap-3 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={
            category === active
              ? "h-20 w-20 shrink-0 rounded-full bg-primary flex items-center justify-center p-2 text-xs text-center font-semibold text-primary-foreground shadow-md transition-transform active:scale-95"
              : "h-20 w-20 shrink-0 rounded-full border border-border bg-card flex items-center justify-center p-2 text-xs text-center font-medium text-muted-foreground shadow-sm transition-all hover:border-primary hover:text-foreground active:scale-95"
          }
        >
          <span className="line-clamp-2 leading-tight">{category}</span>
        </button>
      ))}
    </div>
  );
}
