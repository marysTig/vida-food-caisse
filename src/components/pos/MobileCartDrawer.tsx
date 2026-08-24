import { ShoppingCart, X } from "lucide-react";
import { useEffect } from "react";
import { cartSubtotal, type CartItem } from "@/lib/cart";
import { OrderItem } from "./OrderItem";
import { OrderSummary } from "./OrderSummary";
import { PaymentButton } from "./PaymentButton";

type MobileCartDrawerProps = {
  items: CartItem[];
  table: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (item: CartItem) => void;
  onPay: () => void;
};

export function MobileCartDrawer({
  items,
  table,
  open,
  onOpenChange,
  onIncrease,
  onDecrease,
  onRemove,
  onEdit,
  onPay,
}: MobileCartDrawerProps) {
  const subtotal = cartSubtotal(items);
  const totalItems = items.reduce((acc, i) => acc + i.quantity, 0);

  // Prevent body scroll when drawer is open
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

  return (
    <>
      {/* Floating Cart Button — mobile only */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
        aria-label="Ouvrir le panier"
      >
        <ShoppingCart className="h-6 w-6" />
        {totalItems > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {totalItems}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Slide-up Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl bg-background shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">Commande</h2>
            <p className="text-xs text-muted-foreground">{table}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-bold text-foreground">Aucune commande</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sélectionnez un produit pour commencer une commande.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <OrderItem
                  key={item.id}
                  item={item}
                  onIncrease={onIncrease}
                  onDecrease={onDecrease}
                  onRemove={onRemove}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="space-y-4 border-t border-border bg-card p-4 pb-6">
          <OrderSummary subtotal={subtotal} discount={0} />
          <PaymentButton
            total={subtotal}
            disabled={items.length === 0}
            onClick={() => {
              onOpenChange(false);
              onPay();
            }}
          />
        </div>
      </div>
    </>
  );
}
