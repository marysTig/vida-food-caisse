import { formatDA } from "@/data/menu";

type OrderSummaryProps = {
  subtotal: number;
  discount: number;
};

export function OrderSummary({ subtotal, discount }: OrderSummaryProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Sous-total</span>
        <span className="font-medium text-foreground">{formatDA(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Remise</span>
        <span className="font-medium text-foreground">{formatDA(discount)}</span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-end justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-foreground">Total</span>
        <span className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
          {formatDA(subtotal - discount)}
        </span>
      </div>
    </div>
  );
}
