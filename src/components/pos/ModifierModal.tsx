import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDA, supplements } from "@/data/menu";
import type { CartItem } from "@/lib/cart";

type ModifierModalProps = {
  item: CartItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    id: string,
    supplements: { id: string; label: string; price: number }[],
    note: string,
  ) => void;
};

export function ModifierModal({ item, open, onOpenChange, onConfirm }: ModifierModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (item) {
      setSelected(item.supplements.map((s) => s.id));
      setNote(item.note ?? "");
    }
  }, [item]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier {item?.product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Suppléments</p>
            <div className="space-y-2">
              {supplements.map((supplement) => (
                <label
                  key={supplement.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-3 text-sm"
                >
                  <span className="flex items-center gap-3 text-foreground">
                    <input
                      type="checkbox"
                      checked={selected.includes(supplement.id)}
                      onChange={() => toggle(supplement.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    {supplement.label}
                  </span>
                  <span className="font-semibold text-primary">
                    +{formatDA(supplement.price)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Note</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sans oignons"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border border-border px-5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() =>
              item &&
              onConfirm(
                item.id,
                supplements.filter((s) => selected.includes(s.id)),
                note,
              )
            }
            className="h-11 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ajouter
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
