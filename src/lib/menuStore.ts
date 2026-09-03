import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { type Product } from "@/data/menu";

export type CategoryItem = {
  id: string;
  name: string;
  image: string; // mapped from image_url
};

// ── Supabase helpers ──────────────────────────────────────────────

async function fetchCategoriesFromDB(): Promise<CategoryItem[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, image_url, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement catégories:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row["id"] as string,
    name: row["name"] as string,
    image: (row["image_url"] as string | null) ?? "",
  }));
}

async function fetchProductsFromDB(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category_id, price, image_url, available, options, ingredients, created_at, categories(id, name)")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur chargement produits:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => {
    // Supabase retourne la relation categories comme un objet ou null
    const cat = Array.isArray(row["categories"])
      ? (row["categories"][0] ?? null)
      : (row["categories"] ?? null);

    return {
      id: row["id"] as string,
      name: row["name"] as string,
      category: (cat?.["name"] as string) ?? "",
      price: row["price"] as number,
      image: (row["image_url"] as string | null) ?? "",
      available: (row["available"] as boolean) ?? true,
      options: (row["options"] as Product["options"]) ?? undefined,
      ingredients: (row["ingredients"] as string | null) ?? undefined,
    };
  });
}

// ── Global State (Zustand) ────────────────────────────────────────
// Singleton : partagé entre tous les composants, une seule souscription Supabase

type MenuGlobalState = {
  products: Product[];
  categories: CategoryItem[];
  loading: boolean;
  setProducts: (products: Product[]) => void;
  setCategories: (categories: CategoryItem[]) => void;
  setLoading: (loading: boolean) => void;
};

const useMenuGlobalState = create<MenuGlobalState>((set) => ({
  products: [],
  categories: [],
  loading: true,
  setProducts: (products) => set({ products }),
  setCategories: (categories) => set({ categories }),
  setLoading: (loading) => set({ loading }),
}));

// ── Singleton realtime initializer ───────────────────────────────
// Garantit qu'une seule souscription Supabase est créée (quelle que soit
// le nombre de composants appelant useMenuStore)

let _menuInitialized = false;

async function _initMenuStore(
  setCategories: (c: CategoryItem[]) => void,
  setProducts: (p: Product[]) => void,
  setLoading: (l: boolean) => void,
) {
  if (_menuInitialized) return;
  _menuInitialized = true;

  setLoading(true);
  const [cats, prods] = await Promise.all([
    fetchCategoriesFromDB(),
    fetchProductsFromDB(),
  ]);
  setCategories(cats);
  setProducts(prods);
  setLoading(false);

  const reload = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([fetchCategoriesFromDB(), fetchProductsFromDB()]);
    setCategories(c);
    setProducts(p);
    setLoading(false);
  };

  supabase
    .channel("menu-categories-global")
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, reload)
    .subscribe();

  supabase
    .channel("menu-products-global")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, reload)
    .subscribe();
}

// ── Hook principal ────────────────────────────────────────────────
// API publique identique à l'ancienne version — aucun impact sur les composants

export function useMenuStore() {
  const { products, categories, loading, setProducts, setCategories, setLoading } = useMenuGlobalState();

  // Initialise le store et les souscriptions Realtime une seule fois
  useEffect(() => {
    _initMenuStore(setCategories, setProducts, setLoading);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    setLoading(true);
    const [cats, prods] = await Promise.all([
      fetchCategoriesFromDB(),
      fetchProductsFromDB(),
    ]);
    setCategories(cats);
    setProducts(prods);
    setLoading(false);
  }, [setCategories, setProducts, setLoading]);

  // ── CRUD Catégories ─────────────────────────────────────────────

  const addCategory = async (cat: Omit<CategoryItem, "id">) => {
    const { error } = await supabase.from("categories").insert({
      name: cat.name,
      image_url: cat.image || null,
    });
    if (error) throw new Error(error.message);
    await reload();
  };

  const updateCategory = async (id: string, cat: Omit<CategoryItem, "id">) => {
    const { error } = await supabase
      .from("categories")
      .update({ name: cat.name, image_url: cat.image || null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  // ── CRUD Produits ───────────────────────────────────────────────

  const addProduct = async (prod: Omit<Product, "id">) => {
    const cat = categories.find((c) => c.name === prod.category);
    const { error } = await supabase.from("products").insert({
      name: prod.name,
      category_id: cat?.id ?? null,
      price: prod.price,
      image_url: prod.image || null,
      available: prod.available,
      options: prod.options?.length ? prod.options : null,
      ingredients: prod.ingredients?.trim() || null,
    });
    if (error) throw new Error(error.message);
    await reload();
  };

  const updateProduct = async (id: string, prod: Partial<Product>) => {
    const cat = prod.category
      ? categories.find((c) => c.name === prod.category)
      : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {};
    if (prod.name !== undefined) payload["name"] = prod.name;
    if (prod.price !== undefined) payload["price"] = prod.price;
    if (prod.image !== undefined) payload["image_url"] = prod.image || null;
    if (prod.available !== undefined) payload["available"] = prod.available;
    if (cat !== undefined) payload["category_id"] = cat.id;
    if (prod.options !== undefined) payload["options"] = prod.options?.length ? prod.options : null;
    if (prod.ingredients !== undefined) payload["ingredients"] = prod.ingredients?.trim() || null;

    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await reload();
  };

  // Helper : noms de catégories avec "Tous" en premier
  const allCategoryNames = ["Tous", ...categories.map((c) => c.name)];

  return {
    products,
    categories,
    loading,
    allCategoryNames,
    reload,
    addCategory,
    updateCategory,
    deleteCategory,
    addProduct,
    updateProduct,
    deleteProduct,
  };
}
