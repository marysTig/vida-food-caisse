import type { Product } from "@/data/menu";
import { formatDA } from "@/data/menu";

type ProductCardProps = {
  product: Product;
  onSelect: (product: Product) => void;
};

export function ProductCard({ product, onSelect }: ProductCardProps) {
  return (
    <button
      type="button"
      disabled={!product.available}
      onClick={() => onSelect(product)}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={512}
          height={512}
          className="h-full w-full object-cover"
        />
        <span
          className={
            product.available
              ? "absolute right-2 top-2 rounded-md bg-success px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"
              : "absolute right-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground"
          }
        >
          {product.available ? "Disponible" : "Indisponible"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
        <p className="text-xs text-muted-foreground">{product.category}</p>
        <p className="mt-1 text-base font-bold text-primary">{formatDA(product.price)}</p>
      </div>
    </button>
  );
}
