import type { Category } from "@/data/menu";
import { categories } from "@/data/menu";

type CategoryTabsProps = {
  active: Category;
  onChange: (category: Category) => void;
};

export function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={
            category === active
              ? "h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              : "h-11 rounded-lg border border-border bg-card px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          {category}
        </button>
      ))}
    </div>
  );
}
