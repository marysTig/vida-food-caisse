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
              ? "flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center rounded-full bg-primary p-2 text-center text-[11px] font-bold text-primary-foreground shadow-md transition-transform active:scale-95"
              : "flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center rounded-full border border-border bg-card p-2 text-center text-[11px] font-semibold text-muted-foreground shadow-sm transition-all hover:border-primary hover:text-foreground active:scale-95"
          }
        >
          <span className="line-clamp-2 leading-tight break-words px-1">{category}</span>
        </button>
      ))}
    </div>
  );
}
