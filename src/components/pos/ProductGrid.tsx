import type { Product } from "@/data/menu";
import { ProductCard } from "./ProductCard";

type ProductGridProps = {
  products: Product[];
  onSelect: (product: Product) => void;
};

export function ProductGrid({ products, onSelect }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm font-semibold text-foreground">Aucun produit trouvé</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Essayez un autre nom ou une autre catégorie.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  );
}
