import { Repeat, ShoppingCart } from "lucide-react";
import { cartSubtotal, type CartItem } from "@/lib/cart";
import { OrderItem } from "./OrderItem";
import { OrderSummary } from "./OrderSummary";
import { PaymentButton } from "./PaymentButton";

type OrderPanelProps = {
  items: CartItem[];
  table: string;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (item: CartItem) => void;
  onPay: () => void;
};

export function OrderPanel({
  items,
  table,
  onIncrease,
  onDecrease,
  onRemove,
  onEdit,
  onPay,
}: OrderPanelProps) {
  const subtotal = cartSubtotal(items);

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-border bg-background md:w-[330px] lg:w-[35%] lg:max-w-[420px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-foreground">Commande</h2>
          <p className="text-xs text-muted-foreground">{table}</p>
        </div>
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <Repeat className="h-3.5 w-3.5" />
          Changer de table
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center">
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

      <div className="space-y-4 border-t border-border bg-card p-4">
        <OrderSummary subtotal={subtotal} discount={0} />
        <PaymentButton total={subtotal} disabled={items.length === 0} onClick={onPay} />
      </div>
    </aside>
  );
}
