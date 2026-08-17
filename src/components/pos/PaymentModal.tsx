import { Banknote, CreditCard, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDA } from "@/data/menu";

type PaymentModalProps = {
  open: boolean;
  total: number;
  onOpenChange: (open: boolean) => void;
};

const methods = [
  { label: "Espèces", icon: Banknote },
  { label: "Carte", icon: CreditCard },
  { label: "Crédit client", icon: Wallet },
];

export function PaymentModal({ open, total, onOpenChange }: PaymentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paiement</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/60 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Montant à payer</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-foreground">
            {formatDA(total)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {methods.map((method) => (
            <button
              key={method.label}
              type="button"
              className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold text-foreground transition-colors hover:border-primary"
            >
              <method.icon className="h-5 w-5 text-primary" />
              {method.label}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Module de paiement à connecter prochainement.
        </p>
      </DialogContent>
    </Dialog>
  );
}
