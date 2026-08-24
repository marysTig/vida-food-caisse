import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CategoryTabs } from "@/components/pos/CategoryTabs";
import { MobileBottomNav } from "@/components/pos/MobileBottomNav";
import { MobileCartDrawer } from "@/components/pos/MobileCartDrawer";
import { ModifierModal } from "@/components/pos/ModifierModal";
import { OrderPanel } from "@/components/pos/OrderPanel";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { ProductSearch } from "@/components/pos/ProductSearch";
import { Sidebar } from "@/components/pos/Sidebar";
import { TopBar } from "@/components/pos/TopBar";
import { OptionSelectModal } from "@/components/pos/OptionSelectModal";
import { type Category, type Product, type ProductOption } from "@/data/menu";
import { useMenuStore } from "@/lib/menuStore";
import { cartSubtotal, type CartItem } from "@/lib/cart";

export const Route = createFileRoute("/")(  {
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
  const [cartOpen, setCartOpen] = useState(false);
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);

  const { products, allCategoryNames, loading } = useMenuStore();

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
  }, [category, query, products]);

  const handleProductSelect = (product: Product) => {
    if (product.options && product.options.length > 0) {
      setOptionProduct(product);
    } else {
      addProduct(product);
    }
  };

  const addProduct = (product: Product, selectedOption?: ProductOption) => {
    setItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && 
                  item.supplements.length === 0 && 
                  !item.note &&
                  item.selectedOption?.label === selectedOption?.label
      );
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        { id: `${product.id}-${Date.now()}`, product, quantity: 1, supplements: [], selectedOption },
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
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar query={query} onQueryChange={setQuery} />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-24 md:pb-4 lg:p-5">
            {loading ? (
              <div className="flex flex-1 items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Chargement du menu…</p>
                </div>
              </div>
            ) : (
              <>
                <CategoryTabs
                  active={category}
                  onChange={setCategory}
                  categories={allCategoryNames}
                />
                <div className="md:hidden">
                  <ProductSearch value={query} onChange={setQuery} />
                </div>
                {allCategoryNames.length <= 1 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                    <p className="text-sm font-semibold text-foreground">Menu vide</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ajoutez des catégories et des produits depuis le panneau admin.
                    </p>
                  </div>
                ) : (
                  <ProductGrid products={visibleProducts} onSelect={handleProductSelect} />
                )}
              </>
            )}
          </main>

          {/* Desktop order panel — hidden on mobile */}
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

      {/* Mobile: floating cart button + slide-up drawer */}
      <MobileCartDrawer
        items={items}
        table="Table 12"
        open={cartOpen}
        onOpenChange={setCartOpen}
        onIncrease={increase}
        onDecrease={decrease}
        onRemove={remove}
        onEdit={openModifier}
        onPay={() => setPaymentOpen(true)}
      />

      {/* Mobile bottom navigation bar */}
      <MobileBottomNav />

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

      {optionProduct && (
        <OptionSelectModal
          product={optionProduct}
          onClose={() => setOptionProduct(null)}
          onConfirm={(option) => {
            addProduct(optionProduct, option);
            setOptionProduct(null);
          }}
        />
      )}
    </div>
  );
}
