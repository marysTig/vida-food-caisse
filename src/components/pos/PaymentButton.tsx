import { CreditCard } from "lucide-react";
import { formatDA } from "@/data/menu";

type PaymentButtonProps = {
  total: number;
  disabled?: boolean;
  onClick: () => void;
};

export function PaymentButton({ total, disabled, onClick }: PaymentButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-primary text-base font-extrabold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
    >
      <CreditCard className="h-5 w-5" />
      Payer — {formatDA(total)}
    </button>
  );
}
