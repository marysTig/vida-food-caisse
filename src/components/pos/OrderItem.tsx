import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDA } from "@/data/menu";
import { lineTotal, type CartItem } from "@/lib/cart";

type OrderItemProps = {
  item: CartItem;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (item: CartItem) => void;
};

export function OrderItem({ item, onIncrease, onDecrease, onRemove, onEdit }: OrderItemProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.product.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.quantity} × {formatDA(item.product.price)}
          </p>
          {item.supplements.length > 0 && (
            <p className="mt-1 truncate text-xs text-primary">
              + {item.supplements.map((s) => s.label).join(", ")}
            </p>
          )}
          {item.note && (
            <p className="mt-1 truncate text-xs italic text-muted-foreground">“{item.note}”</p>
          )}
        </div>
        <p className="shrink-0 text-sm font-bold text-foreground">{formatDA(lineTotal(item))}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <button
            type="button"
            onClick={() => onDecrease(item.id)}
            className="grid h-8 w-8 place-items-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-sm font-bold text-foreground">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onIncrease(item.id)}
            className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
