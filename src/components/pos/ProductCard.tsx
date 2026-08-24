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
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            width={512}
            height={512}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
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
        {product.options && product.options.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {product.options.map((opt) => (
              <span key={opt.label} className="rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {opt.label}
              </span>
            ))}
          </div>
        )}
        <p className="mt-auto pt-1 text-base font-bold text-primary">
          {product.options && product.options.length > 0 
            ? `Dès ${formatDA(Math.min(...product.options.map(o => o.price)))}`
            : formatDA(product.price)}
        </p>
      </div>
    </button>
  );
}
