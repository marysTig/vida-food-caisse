import type { Product } from "@/data/menu";
import { formatDA } from "@/data/menu";
import { Plus } from "lucide-react";

type ProductCardProps = {
  product: Product;
  onSelect?: ((product: Product) => void) | undefined;
  readOnly?: boolean;
};

export function ProductCard({ product, onSelect, readOnly = false }: ProductCardProps) {
  const inner = (
    <>
      <div className="relative flex justify-center pt-4 bg-transparent">
        <div className="relative aspect-square w-24 h-24 sm:w-28 sm:h-28 overflow-hidden rounded-full bg-muted shadow-sm border border-border">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              width={512}
              height={512}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <span
          className={
            product.available
              ? "absolute right-2 top-2 rounded-md bg-success/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm"
              : "absolute right-2 top-2 rounded-md bg-destructive/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground shadow-sm"
          }
        >
          {product.available ? "Disponible" : "Indisponible"}
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center text-center gap-1 p-3">
        <p className="truncate w-full text-sm font-semibold text-foreground">{product.name}</p>
        <p className="text-xs text-muted-foreground">{product.category}</p>
        {product.options && product.options.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 mt-0.5">
            {product.options.map((opt) => (
              <span key={opt.label} className="rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {opt.label} â€” {formatDA(opt.price)}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex w-full flex-col items-center justify-center pt-2 gap-2">
          <p className="text-base font-bold text-primary">
            {product.options && product.options.length > 0
              ? `DÃ¨s ${formatDA(Math.min(...product.options.map(o => o.price)))}`
              : formatDA(product.price)}
          </p>
          {/* Bouton + toujours visible sur mobile, visible au hover sur desktop */}
          {!readOnly && product.available && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(product);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all active:scale-90 md:opacity-0 md:group-hover:opacity-100 md:scale-90 md:group-hover:scale-100 absolute bottom-3 right-3"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (readOnly) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left opacity-[0.97]">
        {inner}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={product.available ? 0 : undefined}
      onClick={() => {
        if (product.available) onSelect?.(product);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (product.available) onSelect?.(product);
        }
      }}
      className={`group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all ${
        product.available 
          ? "cursor-pointer hover:border-primary hover:shadow-md" 
          : "cursor-not-allowed opacity-55 hover:border-border"
      }`}
    >
      {inner}
    </div>
  );
}
