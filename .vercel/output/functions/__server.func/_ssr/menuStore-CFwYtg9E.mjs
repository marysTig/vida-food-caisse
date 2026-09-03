import { i as __toESM, n as __exportAll } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
import { a as __exportAll$1, o as supabase } from "./router-1yb7JpPf.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/menuStore-CFwYtg9E.js
var menuStore_CFwYtg9E_exports = /* @__PURE__ */ __exportAll({
	a: () => useAuthStore,
	c: () => verifyAdminPassword,
	i: () => updateAdminCredentials,
	n: () => ADMIN_ROW_ID,
	o: () => useSessionStore,
	r: () => authStore_exports,
	s: () => useUsersStore,
	t: () => useMenuStore
});
var import_react = /* @__PURE__ */ __toESM(require_react());
var authStore_exports = /* @__PURE__ */ __exportAll$1({
	ADMIN_ROW_ID: () => ADMIN_ROW_ID,
	updateAdminCredentials: () => updateAdminCredentials,
	useAuthStore: () => useAuthStore,
	useSessionStore: () => useSessionStore,
	useUsersStore: () => useUsersStore,
	verifyAdminPassword: () => verifyAdminPassword
});
var ADMIN_ROW_ID = "00000000-0000-0000-0000-000000000001";
(function clearStalAdminCache() {
	if (typeof window === "undefined") return;
	try {
		localStorage.removeItem("admin-auth-storage");
	} catch {}
})();
/** Fetch the admin row from Supabase. */
async function fetchAdminRow() {
	const { data } = await supabase.from("pos_users").select("username, password").eq("id", ADMIN_ROW_ID).maybeSingle();
	return data ?? null;
}
/** Save new admin credentials to Supabase — syncs to ALL devices. */
async function updateAdminCredentials(updates) {
	const payload = {};
	if (updates.username !== void 0) payload.username = updates.username.trim();
	if (updates.password !== void 0) payload.password = updates.password;
	const { error } = await supabase.from("pos_users").update(payload).eq("id", ADMIN_ROW_ID);
	if (error) return {
		ok: false,
		error: error.message
	};
	return { ok: true };
}
/** Verify the admin's current password against Supabase (used by AdminProfile before allowing a change). */
async function verifyAdminPassword(password) {
	const row = await fetchAdminRow();
	return row !== null && row.password === password.trim();
}
var useAuthStore = create()((set) => ({
	isAdminAuthenticated: false,
	setAdminAuthenticated: (value) => set({ isAdminAuthenticated: value }),
	logout: () => set({ isAdminAuthenticated: false }),
	login: (_u, _p) => false
}));
var useSessionStore = create()(persist((set) => ({
	currentUser: null,
	setCurrentUser: (user) => set({ currentUser: user }),
	loginUser: async (username, password) => {
		const u = username.trim().toLowerCase();
		const p = password.trim();
		const adminRow = await fetchAdminRow();
		if (adminRow && u === adminRow.username.toLowerCase() && p === adminRow.password) {
			set({ currentUser: {
				userId: ADMIN_ROW_ID,
				username: adminRow.username,
				role: "caisse"
			} });
			useAuthStore.getState().setAdminAuthenticated(true);
			return {
				ok: true,
				isAdmin: true
			};
		}
		const { data, error } = await supabase.from("pos_users").select("id, username, password, role").ilike("username", username.trim()).neq("id", ADMIN_ROW_ID).limit(1).maybeSingle();
		if (error) return {
			ok: false,
			error: `Erreur DB: ${error.message}`
		};
		if (!data) return {
			ok: false,
			error: "Utilisateur introuvable."
		};
		if (data.password !== p) return {
			ok: false,
			error: "Mot de passe incorrect."
		};
		set({ currentUser: {
			userId: data.id,
			username: data.username,
			role: data.role
		} });
		return { ok: true };
	},
	logoutUser: () => set({ currentUser: null })
}), {
	name: "pos-session-storage",
	storage: {
		getItem: (name) => {
			if (typeof window === "undefined") return null;
			const val = sessionStorage.getItem(name);
			return val ? JSON.parse(val) : null;
		},
		setItem: (name, value) => {
			if (typeof window === "undefined") return;
			sessionStorage.setItem(name, JSON.stringify(value));
		},
		removeItem: (name) => {
			if (typeof window === "undefined") return;
			sessionStorage.removeItem(name);
		}
	}
}));
var useUsersStore = create((set) => ({
	users: [],
	loading: false,
	fetchUsers: async () => {
		set({ loading: true });
		const { data, error } = await supabase.from("pos_users").select("id, username, password, role, created_at").neq("id", ADMIN_ROW_ID).order("created_at", { ascending: true });
		if (error) {
			console.error("Erreur chargement utilisateurs:", error.message);
			set({ loading: false });
			return;
		}
		set({
			users: data ?? [],
			loading: false
		});
	},
	addUser: async (username, password, role) => {
		const trimmed = username.trim();
		if (!trimmed || !password) return {
			ok: false,
			error: "Champs requis."
		};
		const { error } = await supabase.from("pos_users").insert({
			username: trimmed,
			password,
			role
		});
		if (error) {
			if (error.code === "23505") return {
				ok: false,
				error: "Ce nom d'utilisateur existe déjà."
			};
			return {
				ok: false,
				error: error.message
			};
		}
		const { data } = await supabase.from("pos_users").select("id, username, password, role, created_at").neq("id", ADMIN_ROW_ID).order("created_at", { ascending: true });
		set({ users: data ?? [] });
		return { ok: true };
	},
	deleteUser: async (id) => {
		await supabase.from("pos_users").delete().eq("id", id);
		set((state) => ({ users: state.users.filter((u) => u.id !== id) }));
	}
}));
async function fetchCategoriesFromDB() {
	const { data, error } = await supabase.from("categories").select("id, name, image_url, created_at").order("created_at", { ascending: true });
	if (error) {
		console.error("Erreur chargement catégories:", error.message);
		return [];
	}
	return (data ?? []).map((row) => ({
		id: row["id"],
		name: row["name"],
		image: row["image_url"] ?? ""
	}));
}
async function fetchProductsFromDB() {
	const { data, error } = await supabase.from("products").select("id, name, category_id, price, image_url, available, options, ingredients, created_at, categories(id, name)").order("created_at", { ascending: true });
	if (error) {
		console.error("Erreur chargement produits:", error.message);
		return [];
	}
	return (data ?? []).map((row) => {
		const cat = Array.isArray(row["categories"]) ? row["categories"][0] ?? null : row["categories"] ?? null;
		return {
			id: row["id"],
			name: row["name"],
			category: cat?.["name"] ?? "",
			price: row["price"],
			image: row["image_url"] ?? "",
			available: row["available"] ?? true,
			options: row["options"] ?? void 0,
			ingredients: row["ingredients"] ?? void 0
		};
	});
}
var useMenuGlobalState = create((set) => ({
	products: [],
	categories: [],
	loading: true,
	setProducts: (products) => set({ products }),
	setCategories: (categories) => set({ categories }),
	setLoading: (loading) => set({ loading })
}));
var _menuInitialized = false;
async function _initMenuStore(setCategories, setProducts, setLoading) {
	if (_menuInitialized) return;
	_menuInitialized = true;
	setLoading(true);
	const [cats, prods] = await Promise.all([fetchCategoriesFromDB(), fetchProductsFromDB()]);
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
	supabase.channel("menu-categories-global").on("postgres_changes", {
		event: "*",
		schema: "public",
		table: "categories"
	}, reload).subscribe();
	supabase.channel("menu-products-global").on("postgres_changes", {
		event: "*",
		schema: "public",
		table: "products"
	}, reload).subscribe();
}
function useMenuStore() {
	const { products, categories, loading, setProducts, setCategories, setLoading } = useMenuGlobalState();
	(0, import_react.useEffect)(() => {
		_initMenuStore(setCategories, setProducts, setLoading);
	}, []);
	const reload = (0, import_react.useCallback)(async () => {
		setLoading(true);
		const [cats, prods] = await Promise.all([fetchCategoriesFromDB(), fetchProductsFromDB()]);
		setCategories(cats);
		setProducts(prods);
		setLoading(false);
	}, [
		setCategories,
		setProducts,
		setLoading
	]);
	const addCategory = async (cat) => {
		const { error } = await supabase.from("categories").insert({
			name: cat.name,
			image_url: cat.image || null
		});
		if (error) throw new Error(error.message);
		await reload();
	};
	const updateCategory = async (id, cat) => {
		const { error } = await supabase.from("categories").update({
			name: cat.name,
			image_url: cat.image || null
		}).eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	const deleteCategory = async (id) => {
		const { error } = await supabase.from("categories").delete().eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	const addProduct = async (prod) => {
		const cat = categories.find((c) => c.name === prod.category);
		const { error } = await supabase.from("products").insert({
			name: prod.name,
			category_id: cat?.id ?? null,
			price: prod.price,
			image_url: prod.image || null,
			available: prod.available,
			options: prod.options?.length ? prod.options : null,
			ingredients: prod.ingredients?.trim() || null
		});
		if (error) throw new Error(error.message);
		await reload();
	};
	const updateProduct = async (id, prod) => {
		const cat = prod.category ? categories.find((c) => c.name === prod.category) : void 0;
		const payload = {};
		if (prod.name !== void 0) payload["name"] = prod.name;
		if (prod.price !== void 0) payload["price"] = prod.price;
		if (prod.image !== void 0) payload["image_url"] = prod.image || null;
		if (prod.available !== void 0) payload["available"] = prod.available;
		if (cat !== void 0) payload["category_id"] = cat.id;
		if (prod.options !== void 0) payload["options"] = prod.options?.length ? prod.options : null;
		if (prod.ingredients !== void 0) payload["ingredients"] = prod.ingredients?.trim() || null;
		const { error } = await supabase.from("products").update(payload).eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	const deleteProduct = async (id) => {
		const { error } = await supabase.from("products").delete().eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	return {
		products,
		categories,
		loading,
		allCategoryNames: ["Tous", ...categories.map((c) => c.name)],
		reload,
		addCategory,
		updateCategory,
		deleteCategory,
		addProduct,
		updateProduct,
		deleteProduct
	};
}
//#endregion
export { useMenuStore as a, verifyAdminPassword as c, useAuthStore as i, menuStore_CFwYtg9E_exports as n, useSessionStore as o, updateAdminCredentials as r, useUsersStore as s, ADMIN_ROW_ID as t };
