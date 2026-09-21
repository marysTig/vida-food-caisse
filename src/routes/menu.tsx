import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMenuStore } from "@/lib/menuStore";
import { formatDA } from "@/data/menu";
import { ChefHat } from "lucide-react";

export const Route = createFileRoute("/menu")({
  component: MenuPublicPage,
});

function MenuPublicPage() {
  const { categories, products, loading } = useMenuStore();
  
  // Set the first category as active by default, or "Tous" if none yet
  const initialCategory = categories.length > 0 ? categories[0].name : "Tous";
  const [activeCategory, setActiveCategory] = useState<string>("");

  useEffect(() => {
    if (!activeCategory && categories.length > 0) {
      setActiveCategory(categories[0].name);
    }
  }, [categories, activeCategory]);

  const visibleProducts = products.filter((product) => {
    return activeCategory === "Tous" || product.category === activeCategory;
  });

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Chargement du menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans">
      {/* ── HEADER BANNÈRE ── */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-sm">
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <ChefHat className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight uppercase">LA VIDA FOOD</h1>
        </div>

        {/* ── CATEGORIES (Scroll Horizontal) ── */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("Tous")}
            className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              activeCategory === "Tous"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.name)}
              className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeCategory === cat.name
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── LISTE DES PRODUITS ── */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl">
          
          <h2 className="mb-6 text-2xl font-bold tracking-tight">
            {activeCategory === "Tous" ? "Notre Menu" : activeCategory}
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => (
              <div
                key={product.id}
                className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md ${
                  !product.available ? "opacity-60 grayscale-[0.5]" : ""
                }`}
              >
                {/* Photo du produit */}
                <div className="relative aspect-video w-full bg-muted">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/30">
                      <ChefHat className="h-12 w-12" />
                    </div>
                  )}
                  {/* Badge Indisponible */}
                  {!product.available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                      <span className="rounded-full bg-foreground px-3 py-1 text-xs font-bold uppercase tracking-wider text-background shadow-lg">
                        Épuisé
                      </span>
                    </div>
                  )}
                </div>

                {/* Contenu */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold leading-tight">{product.name}</h3>
                    {(!product.options || product.options.length === 0) && (
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-extrabold text-primary">
                        {formatDA(product.price)}
                      </span>
                    )}
                  </div>

                  {product.ingredients && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {product.ingredients}
                    </p>
                  )}

                  {/* Variantes */}
                  {product.options && product.options.length > 0 && (
                    <div className="mt-4 flex flex-1 flex-col justify-end space-y-2">
                      <div className="h-px w-full bg-border/50" />
                      {product.options.map((opt) => (
                        <div key={opt.label} className="flex items-center justify-between py-1">
                          <span className="text-sm font-medium">{opt.label}</span>
                          <span className="text-sm font-bold text-primary">
                            {formatDA(opt.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {visibleProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                <ChefHat className="mx-auto mb-3 h-12 w-12 opacity-20" />
                <p>Aucun produit dans cette catégorie pour le moment.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── FOOTER PUBLIC ── */}
      <footer className="border-t border-border bg-muted/30 py-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          © {new Date().getFullYear()} La Vida Food. Tous droits réservés.
        </p>
      </footer>
    </div>
  );
}
