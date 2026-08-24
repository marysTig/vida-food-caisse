import type { Product, ProductOption } from "@/data/menu";

export type CartItem = {
  id: string;
  product: Product;
  quantity: number;
  note?: string | undefined;
  supplements: { id: string; label: string; price: number }[];
  selectedOption?: ProductOption; // option choisie (taille/variante)
};

export function lineTotal(item: CartItem) {
  const extras = item.supplements.reduce((sum, s) => sum + s.price, 0);
  // Si une option est sélectionnée, son prix remplace le prix de base du produit
  const basePrice = item.selectedOption ? item.selectedOption.price : item.product.price;
  return (basePrice + extras) * item.quantity;
}

export function cartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
