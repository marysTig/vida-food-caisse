import { X } from "lucide-react";
import { useState } from "react";
import type { Product, ProductOption } from "@/data/menu";
import { formatDA } from "@/data/menu";

type OptionSelectModalProps = {
  product: Product;
  onConfirm: (option: ProductOption) => void;
  onClose: () => void;
};

export function OptionSelectModal({ product, onConfirm, onClose }: OptionSelectModalProps) {
  const [selected, setSelected] = useState<ProductOption | null>(
    product.options?.[0] ?? null
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">

        {/* Image + header */}
        {product.image && (
          <div className="relative h-40 w-full overflow-hidden bg-muted">
            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <button
              onClick={onClose}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="p-4 flex flex-col gap-4">
          {/* Title & close (if no image) */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground">{product.name}</h3>
              {product.ingredients && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {product.ingredients}
                </p>
              )}
            </div>
            {!product.image && (
              <button
                onClick={onClose}
                className="shrink-0 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Options grid */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Choisissez une option
            </p>
            <div className="grid grid-cols-2 gap-2">
              {product.options!.map((opt) => {
                const isSelected = selected?.label === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelected(opt)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-3 py-3 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted"
                    }`}
                  >
                    <span className={`text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {opt.label}
                    </span>
                    <span className={`text-xs font-semibold ${isSelected ? "text-primary/80" : "text-muted-foreground"}`}>
                      {formatDA(opt.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confirm button */}
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {selected ? `Ajouter — ${formatDA(selected.price)}` : "Sélectionnez une option"}
          </button>
        </div>
      </div>
    </div>
  );
}
