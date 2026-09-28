import type { Product, ProductOption } from "@/data/menu";

export type CartItem = {
  id: string;
  product: Product;
  quantity: number;
  note?: string | undefined;
  supplements: { id: string; label: string; price: number }[];
  selectedOption?: ProductOption | undefined; // option choisie (taille/variante)
  customPrice?: number | undefined; // prix modifié manuellement
  /** Last successfully kitchen-printed fingerprint (null = never printed) */
  kitchenFingerprint?: string | null | undefined;
  /** ISO timestamp of last successful kitchen print for this line */
  kitchenPrintedAt?: string | null | undefined;
};

/**
 * Stable kitchen-relevant fingerprint for delta printing.
 * Changes to qty, note, supplements, or option invalidate the previous print.
 */
export function computeKitchenFingerprint(item: CartItem): string {
  const supplementIds = [...item.supplements.map((s) => s.id)].sort().join(",");
  const option = item.selectedOption?.label ?? "";
  const note = (item.note ?? "").trim();
  return [
    item.product.id,
    option,
    supplementIds,
    note,
    String(item.quantity),
  ].join("|");
}

/** Lines that are new or whose kitchen-relevant content changed since last print. */
export function getKitchenDelta(items: CartItem[]): CartItem[] {
  return items.filter(
    (item) => computeKitchenFingerprint(item) !== (item.kitchenFingerprint ?? null),
  );
}

export function lineTotal(item: CartItem) {
  const extras = item.supplements.reduce((sum, s) => sum + s.price, 0);
  // Si une option est sélectionnée, son prix remplace le prix de base du produit
  let basePrice = item.selectedOption ? item.selectedOption.price : item.product.price;
  if (item.customPrice !== undefined) {
    basePrice = item.customPrice;
  }
  return (basePrice * item.quantity) + extras;
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
