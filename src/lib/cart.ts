import type { Product } from "@/data/menu";

export type CartItem = {
  id: string;
  product: Product;
  quantity: number;
  note?: string | undefined;
  supplements: { id: string; label: string; price: number }[];
};

export function lineTotal(item: CartItem) {
  const extras = item.supplements.reduce((sum, s) => sum + s.price, 0);
  return (item.product.price + extras) * item.quantity;
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
