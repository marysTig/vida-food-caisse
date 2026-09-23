import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import { formatDA } from "@/data/menu";
import type { CartItem } from "@/lib/cart";
import type { GlobalSupplement } from "@/lib/globalSupplementsStore";

type SupplementModalProps = {
  item: CartItem | null;
  open: boolean;
  allSupplements: GlobalSupplement[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    id: string,
    supplements: { id: string; label: string; price: number }[]
  ) => void;
};

export function SupplementModal({ item, open, allSupplements, onOpenChange, onConfirm }: SupplementModalProps) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (item) {
      setSelected(item.supplements.map((s) => s.id));
    }
  }, [item, open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  if (!open) return null;

  const productLabel = item
    ? `${item.product.name}${item.selectedOption ? ` (${item.selectedOption.label})` : ""}`
    : "";

  return createPortal(
    // Render directly on document.body so no parent stacking context can clip us
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 99999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal panel */}
      <div
        className="relative flex w-full flex-col rounded-t-2xl sm:rounded-2xl bg-background shadow-2xl overflow-hidden"
        style={{ zIndex: 100000, maxWidth: 480, maxHeight: "90dvh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-base font-bold text-foreground">Ajouter un supplément</p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[240px]">{productLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Supplement list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {allSupplements.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-muted-foreground">
              Aucun supplément configuré.
            </p>
          ) : (
            allSupplements.map((supplement) => (
              <label
                key={supplement.id}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <span className="flex items-center gap-3 text-foreground">
                  <input
                    type="checkbox"
                    checked={selected.includes(supplement.id)}
                    onChange={() => toggle(supplement.id)}
                    className="h-5 w-5 accent-primary rounded"
                  />
                  <span className="font-medium">{supplement.label}</span>
                </span>
                <span className="ml-2 shrink-0 font-bold text-primary">
                  +{formatDA(supplement.price)}
                </span>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 border-t border-border bg-card p-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 h-12 rounded-xl border border-border text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground active:bg-muted"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              if (item) {
                const selectedSupplements = allSupplements
                  .filter((s) => selected.includes(s.id))
                  .map((s) => ({ id: s.id, label: s.label, price: s.price }));
                onConfirm(item.id, selectedSupplements);
              }
            }}
            className="flex-1 h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
