import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  CreditCard,
  Receipt,
  NotebookPen,
  CheckCircle2,
} from "lucide-react";
import { type CartItem, lineTotal, cartSubtotal } from "@/lib/cart";
import { formatDA } from "@/data/menu";

type CheckoutReceiptModalProps = {
  open: boolean;
  tableNumber: number | string;
  items: CartItem[];
  orderNote?: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
};

export function CheckoutReceiptModal({
  open,
  tableNumber,
  items,
  orderNote,
  onClose,
  onConfirm,
}: CheckoutReceiptModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const subtotal = cartSubtotal(items);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // Fermer avec Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Empêcher le scroll du body
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  // Date et heure actuelles
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // ── Rendu via portal directement sur document.body ──
  // Cela évite tout problème de stacking context (z-index, transform, backdrop-filter)
  // dans la WebView Android Capacitor.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative flex w-full max-w-md flex-col rounded-2xl bg-background shadow-2xl overflow-hidden"
        style={{ zIndex: 10000, maxHeight: "90vh" }}
      >
        {/* ── En-tête ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15">
              <Receipt className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Récapitulatif</p>
              <p className="text-xs text-muted-foreground">
                {typeof tableNumber === "number" ? `Table ${tableNumber}` : tableNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Ticket / Détail commande ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Date + heure */}
          <div className="flex items-center justify-between bg-muted/40 px-5 py-2.5 text-[11px] text-muted-foreground">
            <span>{dateStr}</span>
            <span>{timeStr}</span>
          </div>

          {/* Lignes de commande */}
          <div className="divide-y divide-border/60 px-5">
            {items.map((item) => {
              const basePrice =
                item.customPrice !== undefined
                  ? item.customPrice
                  : item.selectedOption
                    ? item.selectedOption.price
                    : item.product.price;

              return (
                <div key={item.id} className="py-3.5">
                  {/* Produit + total ligne */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        <span className="mr-2 text-muted-foreground">
                          {item.quantity}×
                        </span>
                        {item.product.name}
                        {item.selectedOption && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            ({item.selectedOption.label})
                          </span>
                        )}
                      </p>

                      {/* Prix unitaire */}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDA(basePrice)} / unité
                        {item.customPrice !== undefined && (
                          <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
                            prix modifié
                          </span>
                        )}
                      </p>

                      {/* Suppléments */}
                      {item.supplements.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.supplements.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                            >
                              + {s.label}{" "}
                              <span className="opacity-70">
                                ({formatDA(s.price)})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Note sur l'article */}
                      {item.note && (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">
                          ✎ {item.note}
                        </p>
                      )}
                    </div>

                    <p className="shrink-0 text-sm font-bold text-foreground">
                      {formatDA(lineTotal(item))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Note globale de commande */}
          {orderNote && (
            <div className="mx-5 mb-4 mt-2 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3">
              <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs italic text-muted-foreground">{orderNote}</p>
            </div>
          )}
        </div>

        {/* ── Pied : total + bouton ── */}
        <div className="shrink-0 border-t border-border bg-card px-5 py-4 space-y-4">

          {/* Ligne articles */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {itemCount} article{itemCount > 1 ? "s" : ""}
            </span>
          </div>

          {/* Séparateur tirets style ticket */}
          <div className="border-t-2 border-dashed border-border" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-foreground">Total</span>
            <span className="text-2xl font-extrabold text-success">
              {formatDA(subtotal)}
            </span>
          </div>

          {/* Bouton Encaisser centré */}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-success py-4 text-base font-bold text-success-foreground shadow-lg transition-all active:scale-[0.98]"
          >
            <CreditCard className="h-5 w-5" />
            Encaisser
            <CheckCircle2 className="h-4 w-4 opacity-80" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
