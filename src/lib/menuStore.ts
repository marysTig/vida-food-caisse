import { useState, useEffect, useCallback } from "react";
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

// ── Hook principal ────────────────────────────────────────────────

export function useMenuStore() {
  const [products, setProductsState] = useState<Product[]>([]);
  const [categories, setCategoriesState] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [cats, prods] = await Promise.all([
      fetchCategoriesFromDB(),
      fetchProductsFromDB(),
    ]);
    setCategoriesState(cats);
    setProductsState(prods);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();

    // Temps réel
    const catChannel = supabase
      .channel("categories-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, reload)
      .subscribe();

    const prodChannel = supabase
      .channel("products-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, reload)
      .subscribe();

    return () => {
      supabase.removeChannel(catChannel);
      supabase.removeChannel(prodChannel);
    };
  }, [reload]);

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
