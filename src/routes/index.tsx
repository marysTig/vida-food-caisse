import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CategoryTabs } from "@/components/pos/CategoryTabs";
import { ModifierModal } from "@/components/pos/ModifierModal";
import { OrderPanel } from "@/components/pos/OrderPanel";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { ProductSearch } from "@/components/pos/ProductSearch";
import { Sidebar } from "@/components/pos/Sidebar";
import { TopBar } from "@/components/pos/TopBar";
import { products, type Category, type Product } from "@/data/menu";
import { cartSubtotal, type CartItem } from "@/lib/cart";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caisse POS — La Vida Food" },
      {
        name: "description",
        content:
          "Interface de caisse La Vida Food : prise de commande rapide, panier en temps réel et paiement en un clic.",
      },
      { property: "og:title", content: "Caisse POS — La Vida Food" },
      {
        property: "og:description",
        content:
          "Interface de caisse La Vida Food : prise de commande rapide, panier en temps réel et paiement en un clic.",
      },
    ],
  }),
  component: CaissePage,
});

function CaissePage() {
  const [category, setCategory] = useState<Category>("Tous");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [editing, setEditing] = useState<CartItem | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "Tous" || product.category === category;
      const matchesTerm =
        term.length === 0 ||
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [category, query]);

  const addProduct = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.supplements.length === 0 && !item.note,
      );
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        { id: `${product.id}-${Date.now()}`, product, quantity: 1, supplements: [] },
      ];
    });
  };

  const increase = (id: string) =>
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item)),
    );

  const decrease = (id: string) =>
    setItems((prev) =>
      prev.flatMap((item) =>
        item.id === id
          ? item.quantity > 1
            ? [{ ...item, quantity: item.quantity - 1 }]
            : []
          : [item],
      ),
    );

  const remove = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const openModifier = (item: CartItem) => {
    setEditing(item);
    setModifierOpen(true);
  };

  const confirmModifier = (
    id: string,
    supplements: { id: string; label: string; price: number }[],
    note: string,
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, supplements, note: note.trim() || undefined } : item,
      ),
    );
    setModifierOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar query={query} onQueryChange={setQuery} />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:p-5">
            <CategoryTabs active={category} onChange={setCategory} />
            <div className="md:hidden">
              <ProductSearch value={query} onChange={setQuery} />
            </div>
            <ProductGrid products={visibleProducts} onSelect={addProduct} />
          </main>

          <OrderPanel
            items={items}
            table="Table 12"
            onIncrease={increase}
            onDecrease={decrease}
            onRemove={remove}
            onEdit={openModifier}
            onPay={() => setPaymentOpen(true)}
          />
        </div>
      </div>

      <ModifierModal
        item={editing}
        open={modifierOpen}
        onOpenChange={setModifierOpen}
        onConfirm={confirmModifier}
      />
      <PaymentModal
        open={paymentOpen}
        total={cartSubtotal(items)}
        onOpenChange={setPaymentOpen}
      />
    </div>
  );
}
