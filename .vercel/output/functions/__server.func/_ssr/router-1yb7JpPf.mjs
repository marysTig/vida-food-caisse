import { i as __toESM } from "../_runtime.mjs";
import { t as createClient } from "../_libs/supabase__supabase-js.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as create } from "../_libs/zustand.mjs";
import { A as redirect, c as HeadContent, d as createRouter, f as Outlet, g as Link, h as createRootRouteWithContext, m as createFileRoute, p as lazyRouteComponent, s as Scripts, v as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { t as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { L as ChefHat } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/supabase-DkzF07k5.js
var supabase = createClient("https://jmetlepihmkgvlvyeyph.supabase.co", "sb_publishable_U4LBFI-Wu8TIPoXfQzRsGw_jzm726YW");
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/rolldown-runtime-D7D4PA-g.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/router-1yb7JpPf.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var useTableGlobalState = create((set) => ({
	rooms: [],
	tables: [],
	loading: true,
	setRooms: (rooms) => set({ rooms }),
	setTables: (tables) => set((state) => ({ tables: typeof tables === "function" ? tables(state.tables) : tables })),
	setLoading: (loading) => set({ loading })
}));
async function fetchRoomsFromDB() {
	const { data, error } = await supabase.from("rooms").select("id, name, created_at").order("created_at", { ascending: true });
	if (error) {
		console.error("Erreur chargement salles:", error.message);
		return [];
	}
	return (data ?? []).map((row) => ({
		id: row["id"],
		name: row["name"]
	}));
}
async function fetchTablesFromDB() {
	const { data, error } = await supabase.from("tables").select("id, number, seats, status, room_id, order_total, occupied_since, parent_table_id, created_at").order("number", { ascending: true });
	if (error) {
		console.error("Erreur chargement tables:", error.message);
		return [];
	}
	return (data ?? []).map((row) => {
		const item = {
			id: row["id"],
			number: row["number"],
			seats: row["seats"],
			status: row["status"] ?? "libre",
			roomId: row["room_id"]
		};
		if (row["order_total"] != null) item.orderTotal = row["order_total"];
		if (row["occupied_since"] != null) item.occupiedSince = row["occupied_since"];
		if (row["parent_table_id"] !== void 0) item.parentTableId = row["parent_table_id"];
		return item;
	});
}
async function reloadTableStore(isInitialLoad = false) {
	const store = useTableGlobalState.getState();
	if (isInitialLoad) store.setLoading(true);
	try {
		const [fetchedRooms, fetchedTables] = await Promise.all([fetchRoomsFromDB(), fetchTablesFromDB()]);
		store.setRooms(fetchedRooms);
		store.setTables(fetchedTables);
	} catch (error) {
		console.error("Error reloading table store:", error);
		throw error;
	} finally {
		if (isInitialLoad) store.setLoading(false);
	}
}
var _initialized$1 = false;
async function _initTableSync() {
	if (_initialized$1) return;
	try {
		await reloadTableStore(true);
	} catch (error) {
		return;
	}
	_initialized$1 = true;
	supabase.channel("tables-rooms-realtime").on("postgres_changes", {
		event: "*",
		schema: "public",
		table: "rooms"
	}, (payload) => {
		const store = useTableGlobalState.getState();
		if (payload.eventType === "DELETE") store.setRooms(store.rooms.filter((r) => r.id !== payload.old.id));
		else {
			const newRoom = {
				id: payload.new.id,
				name: payload.new.name
			};
			const exists = store.rooms.some((r) => r.id === newRoom.id);
			store.setRooms(exists ? store.rooms.map((r) => r.id === newRoom.id ? newRoom : r) : [...store.rooms, newRoom]);
		}
	}).on("postgres_changes", {
		event: "*",
		schema: "public",
		table: "tables"
	}, (payload) => {
		const store = useTableGlobalState.getState();
		if (payload.eventType === "DELETE") store.setTables((prev) => prev.filter((t) => t.id !== payload.old.id));
		else {
			const row = payload.new;
			const item = {
				id: row["id"],
				number: row["number"],
				seats: row["seats"],
				status: row["status"] ?? "libre",
				roomId: row["room_id"]
			};
			if (row["order_total"] != null) item.orderTotal = row["order_total"];
			if (row["occupied_since"] != null) item.occupiedSince = row["occupied_since"];
			if (row["parent_table_id"] !== void 0) item.parentTableId = row["parent_table_id"];
			store.setTables((prev) => {
				if (prev.some((t) => t.id === item.id)) return prev.map((t) => t.id === item.id ? item : t);
				return [...prev, item].sort((a, b) => a.number - b.number);
			});
		}
	}).subscribe((status, err) => {
		if (status === "CHANNEL_ERROR" || status === "CLOSED") {
			console.error("[tables-rooms] Realtime channel error:", status, err);
			_initialized$1 = false;
		}
	});
}
function useTableSync() {
	(0, import_react.useEffect)(() => {
		_initTableSync();
	}, []);
}
function useTableStore() {
	const { rooms, tables, loading, setRooms, setTables, setLoading } = useTableGlobalState();
	const reload = reloadTableStore;
	const addRoom = async (name) => {
		const { data, error } = await supabase.from("rooms").insert({ name }).select().single();
		if (error) throw new Error(error.message);
		await reload();
		return data.id;
	};
	const deleteRoom = async (id) => {
		const { error } = await supabase.from("rooms").delete().eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	const addTable = async (table) => {
		const { data, error } = await supabase.from("tables").insert({
			number: table.number,
			seats: table.seats,
			status: table.status,
			room_id: table.roomId
		}).select().single();
		if (error) throw new Error(error.message);
		await reload();
		return data.id;
	};
	const updateTable = async (id, table) => {
		setTables((prev) => prev.map((t) => t.id === id ? {
			...t,
			...table
		} : t));
		const payload = {};
		if (table.number !== void 0) payload["number"] = table.number;
		if (table.seats !== void 0) payload["seats"] = table.seats;
		if (table.status !== void 0) payload["status"] = table.status;
		if (table.roomId !== void 0) payload["room_id"] = table.roomId;
		if (table.orderTotal !== void 0) payload["order_total"] = table.orderTotal;
		if (table.occupiedSince !== void 0) payload["occupied_since"] = table.occupiedSince;
		if (table.occupiedSince === null) payload["occupied_since"] = null;
		if (table.parentTableId !== void 0) payload["parent_table_id"] = table.parentTableId;
		const { error } = await supabase.from("tables").update(payload).eq("id", id);
		if (error) {
			console.error("Erreur updateTable:", error.message);
			await reload();
			throw new Error(error.message);
		}
	};
	const deleteTable = async (id) => {
		const { error } = await supabase.from("tables").delete().eq("id", id);
		if (error) throw new Error(error.message);
		await reload();
	};
	const mergeTablesDB = async (primaryId, otherIds, totalAmountToAdd) => {
		const primary = tables.find((t) => t.id === primaryId);
		if (primary) await updateTable(primaryId, { orderTotal: (primary.orderTotal || 0) + totalAmountToAdd });
		for (const id of otherIds) await updateTable(id, {
			orderTotal: 0,
			parentTableId: primaryId
		});
	};
	return {
		rooms,
		tables,
		loading,
		reload,
		addRoom,
		deleteRoom,
		addTable,
		updateTable,
		deleteTable,
		mergeTablesDB
	};
}
var upsertTimers = {};
function scheduleUpsert(tableId, items, note) {
	clearTimeout(upsertTimers[tableId]);
	upsertTimers[tableId] = setTimeout(async () => {
		const { error } = await supabase.from("table_orders").upsert({
			table_id: tableId,
			items,
			note,
			updated_at: (/* @__PURE__ */ new Date()).toISOString()
		}, { onConflict: "table_id" });
		if (error) console.error("[table_orders] upsert error:", error.message);
	}, 300);
}
async function deleteFromDB(tableId) {
	clearTimeout(upsertTimers[tableId]);
	const { error } = await supabase.from("table_orders").delete().eq("table_id", tableId);
	if (error) console.error("[table_orders] delete error:", error.message);
}
var useTableOrdersStore = create((set, get) => ({
	orders: {},
	orderNotes: {},
	_setAll: (orders, notes) => set({
		orders,
		orderNotes: notes
	}),
	_patchOrder: (tableId, items) => set((state) => ({ orders: {
		...state.orders,
		[tableId]: items
	} })),
	_patchNote: (tableId, note) => set((state) => ({ orderNotes: {
		...state.orderNotes,
		[tableId]: note
	} })),
	_removeOrder: (tableId) => set((state) => {
		const orders = { ...state.orders };
		const orderNotes = { ...state.orderNotes };
		delete orders[tableId];
		delete orderNotes[tableId];
		return {
			orders,
			orderNotes
		};
	}),
	setOrder: (tableId, items) => {
		const note = get().orderNotes[tableId] ?? "";
		set((s) => ({ orders: {
			...s.orders,
			[tableId]: items
		} }));
		scheduleUpsert(tableId, items, note);
	},
	setOrderNote: (tableId, note) => {
		const items = get().orders[tableId] ?? [];
		set((s) => ({ orderNotes: {
			...s.orderNotes,
			[tableId]: note
		} }));
		scheduleUpsert(tableId, items, note);
	},
	clearOrder: (tableId) => {
		set((state) => {
			const orders = { ...state.orders };
			const orderNotes = { ...state.orderNotes };
			delete orders[tableId];
			delete orderNotes[tableId];
			return {
				orders,
				orderNotes
			};
		});
		deleteFromDB(tableId);
	},
	mergeOrders: (primaryId, sourceIds) => {
		set((state) => {
			const newOrders = { ...state.orders };
			const newNotes = { ...state.orderNotes };
			let combinedItems = [...newOrders[primaryId] || []];
			const noteParts = [];
			if (newNotes[primaryId]) noteParts.push(newNotes[primaryId]);
			for (const id of sourceIds) {
				if (newOrders[id]) {
					combinedItems = [...combinedItems, ...newOrders[id]];
					delete newOrders[id];
				}
				if (newNotes[id]) {
					noteParts.push(newNotes[id]);
					delete newNotes[id];
				}
			}
			newOrders[primaryId] = combinedItems;
			const mergedNote = noteParts.join(" | ");
			if (mergedNote) newNotes[primaryId] = mergedNote;
			scheduleUpsert(primaryId, newOrders[primaryId], newNotes[primaryId] ?? "");
			for (const id of sourceIds) deleteFromDB(id);
			return {
				orders: newOrders,
				orderNotes: newNotes
			};
		});
	}
}));
var _initialized = false;
async function _initTableOrdersSync() {
	if (_initialized) return;
	try {
		const { data, error } = await supabase.from("table_orders").select("table_id, items, note");
		if (error) {
			console.error("[table_orders] initial load error:", error.message);
			return;
		}
		const orders = {};
		const notes = {};
		for (const row of data ?? []) {
			orders[row.table_id] = row.items;
			notes[row.table_id] = row.note ?? "";
		}
		useTableOrdersStore.getState()._setAll(orders, notes);
	} catch (err) {
		console.error("[table_orders] try/catch error:", err);
		return;
	}
	_initialized = true;
	supabase.channel("table-orders-realtime").on("postgres_changes", {
		event: "*",
		schema: "public",
		table: "table_orders"
	}, (payload) => {
		const store = useTableOrdersStore.getState();
		if (payload.eventType === "DELETE") store._removeOrder(payload.old.table_id);
		else {
			const row = payload.new;
			store._patchOrder(row.table_id, row.items);
			store._patchNote(row.table_id, row.note ?? "");
		}
	}).subscribe((status, err) => {
		if (status === "CHANNEL_ERROR" || status === "CLOSED") {
			console.error("[table_orders] Realtime channel error:", status, err);
			_initialized = false;
		}
	});
}
/**
* Appeler ce hook UNE SEULE FOIS dans le composant racine (RootComponent).
* Il charge les commandes depuis Supabase et active le Realtime.
*/
function useTableOrdersSync() {
	(0, import_react.useEffect)(() => {
		_initTableOrdersSync();
	}, []);
}
var styles_default = "/assets/styles-Dex8q5-C.css";
function reportLovableError(error, context = {}) {
	if (typeof window === "undefined") return;
	window.__lovableEvents?.captureException?.(error, {
		source: "react_error_boundary",
		route: window.location.pathname,
		...context
	}, {
		mechanism: "react_error_boundary",
		handled: false,
		severity: "error"
	});
	const message = error instanceof Response ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}` : error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : void 0;
	window.__lovableReportRuntimeError?.({
		message,
		...stack !== void 0 && { stack },
		filename: window.location.pathname
	});
}
function PageLoader() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-screen w-full flex-col items-center justify-center bg-background p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative flex flex-col items-center gap-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-32 w-32 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-primary/20" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 w-24 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_200ms] rounded-full bg-primary/30" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-xl shadow-primary/30",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChefHat, { className: "h-10 w-10 animate-bounce text-primary-foreground" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "z-10 flex flex-col items-center gap-2 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-xl font-bold tracking-tight text-foreground",
							children: "Chargement en cours..."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-medium text-muted-foreground",
							children: "Veuillez patienter quelques instants"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-full w-1/2 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary",
								style: { animationName: "slide" }
							})
						})
					]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: `
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      ` })]
	});
}
function ComponentLoader() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center justify-center py-20 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative mb-4 h-12 w-12",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 animate-ping rounded-full bg-primary/20" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "relative flex h-full w-full items-center justify-center rounded-full bg-primary/10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" })
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm font-semibold text-muted-foreground animate-pulse",
			children: "Chargement..."
		})]
	});
}
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-bold text-foreground",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-semibold text-foreground",
					children: "Page not found"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "The page you're looking for doesn't exist or has been moved."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Go home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		reportLovableError(error, { boundary: "tanstack_root_error_component" });
	}, [error]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold tracking-tight text-foreground",
					children: "This page didn't load"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Something went wrong on our end. You can try refreshing or head back home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$5 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "La Vida Food — Caisse POS" },
			{
				name: "description",
				content: "Logiciel de caisse pour le restaurant La Vida Food."
			},
			{
				name: "author",
				content: "La Vida Food"
			},
			{
				property: "og:title",
				content: "La Vida Food — Caisse POS"
			},
			{
				property: "og:description",
				content: "Logiciel de caisse pour le restaurant La Vida Food."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			}
		],
		links: [
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
			},
			{
				rel: "icon",
				href: "/favicon.ico",
				type: "image/x-icon"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent,
	pendingComponent: PageLoader
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$5.useRouteContext();
	useTableSync();
	useTableOrdersSync();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
		client: queryClient,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
	});
}
var $$splitComponentImporter$4 = () => import("./routes-DTEZEvkE.mjs");
var Route$4 = createFileRoute("/")({
	head: () => ({ meta: [{ title: "Tables — La Vida Food" }, {
		name: "description",
		content: "Gestion des tables La Vida Food."
	}] }),
	beforeLoad: () => {
		throw redirect({ to: "/tables" });
	},
	component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
var $$splitComponentImporter$3 = () => import("./admin-CD0r8Tat.mjs");
var Route$3 = createFileRoute("/admin")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
var $$splitComponentImporter$2 = () => import("./emporter-BEABOBLt.mjs");
var Route$2 = createFileRoute("/emporter")({
	head: () => ({ meta: [{ title: "Emporter — La Vida Food" }] }),
	component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
var $$splitComponentImporter$1 = () => import("./serveur-BwQgXUDr.mjs");
var Route$1 = createFileRoute("/serveur")({
	head: () => ({ meta: [{ title: "Tables — La Vida Food" }, {
		name: "description",
		content: "Gestion des tables La Vida Food."
	}] }),
	beforeLoad: () => {
		throw redirect({ to: "/tables" });
	},
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
var $$splitComponentImporter = () => import("./tables-CiLHtV2v.mjs");
var Route = createFileRoute("/tables")({
	head: () => ({ meta: [{ title: "Tables — La Vida Food" }] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var rootRouteChildren = {
	IndexRoute: Route$4.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$5
	}),
	AdminRoute: Route$3.update({
		id: "/admin",
		path: "/admin",
		getParentRoute: () => Route$5
	}),
	EmporterRoute: Route$2.update({
		id: "/emporter",
		path: "/emporter",
		getParentRoute: () => Route$5
	}),
	ServeurRoute: Route$1.update({
		id: "/serveur",
		path: "/serveur",
		getParentRoute: () => Route$5
	}),
	TablesRoute: Route.update({
		id: "/tables",
		path: "/tables",
		getParentRoute: () => Route$5
	})
};
var routeTree = Route$5._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
var getRouter = () => {
	const queryClient = new QueryClient();
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { __exportAll as a, useTableStore as i, ComponentLoader as n, supabase as o, useTableOrdersStore as r, router_exports as t };
