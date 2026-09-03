import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { G as Ban, N as Clock, u as ShoppingBag } from "../_libs/lucide-react.mjs";
import { i as useTableStore, n as ComponentLoader, r as useTableOrdersStore } from "./router-DrkdTGnv.mjs";
import { a as formatDA, i as TableOrderSidebar, n as MobileBottomNav, o as formatElapsed, r as Sidebar, t as CheckoutReceiptModal } from "./tables-D4WSPZf3.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/emporter-BP-gTAOo.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function EmporterPage() {
	const { tables: tableData, loading, updateTable, rooms } = useTableStore();
	const { orders, orderNotes, clearOrder } = useTableOrdersStore();
	const [activeTable, setActiveTable] = (0, import_react.useState)(null);
	const [checkoutTable, setCheckoutTable] = (0, import_react.useState)(null);
	const emporterRoom = rooms.find((r) => r.name.toLowerCase() === "emporter");
	const emporterTables = emporterRoom ? tableData.filter((t) => t.roomId === emporterRoom.id && t.status !== "libre") : [];
	const handleStatusChange = async (id, status) => {
		await updateTable(id, {
			status: "libre",
			orderTotal: 0,
			occupiedSince: null
		});
	};
	const handleQuickCheckout = async () => {
		if (!checkoutTable) return;
		clearOrder(checkoutTable.id);
		await updateTable(checkoutTable.id, {
			status: "libre",
			orderTotal: 0,
			occupiedSince: null
		});
		setCheckoutTable(null);
	};
	const checkoutItems = checkoutTable ? orders[checkoutTable.id] ?? [] : [];
	const checkoutNote = checkoutTable ? orderNotes[checkoutTable.id] ?? void 0 : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-screen overflow-hidden bg-background font-sans",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, { activePage: "emporter" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-w-0 flex-1 flex-col overflow-hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, { className: "h-5 w-5 text-primary-foreground" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-lg font-bold text-foreground",
						children: "À emporter"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted-foreground",
						children: "Commandes en cours"
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: "flex-1 overflow-y-auto p-4 pb-24 md:pb-4",
					children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComponentLoader, {}) : emporterTables.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-dashed border-border bg-card p-10 text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-semibold text-foreground",
							children: "Aucune commande à emporter en cours"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted-foreground",
							children: "Utilisez le bouton \"À emporter\" sur le plan de salle."
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
						children: emporterTables.map((table) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							onClick: () => setActiveTable({
								id: table.id,
								number: table.number
							}),
							className: "relative flex cursor-pointer flex-col gap-2 rounded-3xl border-2 border-b-[6px] border-orange-300 bg-orange-100 p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:translate-y-1 active:border-b-[2px] active:scale-[0.98] dark:border-orange-700 dark:bg-orange-950/60",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap items-start justify-between gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs font-medium text-muted-foreground",
											children: "Emporter"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "text-2xl font-extrabold text-foreground leading-none mt-0.5",
											children: ["#", table.number]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "shrink-0 flex items-center gap-1.5 rounded-full border-2 border-orange-300 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-orange-700 dark:border-orange-700 dark:bg-black/40 dark:text-orange-400",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "shrink-0 h-1.5 w-1.5 rounded-full bg-orange-500" }), "En cours"]
									})]
								}),
								table.occupiedSince && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap items-center justify-between gap-2 mt-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded-md",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "shrink-0 h-3.5 w-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "whitespace-nowrap font-medium",
											children: formatElapsed(table.occupiedSince)
										})]
									}), table.orderTotal !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "whitespace-nowrap text-sm font-bold text-foreground bg-primary/10 text-primary px-2 py-1 rounded-md",
										children: formatDA(table.orderTotal)
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-auto flex flex-wrap gap-2 pt-1",
									onClick: (e) => e.stopPropagation(),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => setCheckoutTable({
											id: table.id,
											number: table.number
										}),
										className: "flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-95",
										children: "Encaisser"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => handleStatusChange(table.id, "libre"),
										className: "rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive active:scale-95",
										title: "Annuler (Libérer)",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { className: "h-3.5 w-3.5" })
									})]
								})
							]
						}, table.id))
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileBottomNav, { activePage: "emporter" }),
			activeTable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableOrderSidebar, {
				tableId: activeTable.id,
				tableNumber: activeTable.number,
				onClose: () => setActiveTable(null)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckoutReceiptModal, {
				open: checkoutTable !== null,
				tableNumber: `Emporter #${checkoutTable?.number}`,
				items: checkoutItems,
				...checkoutNote ? { orderNote: checkoutNote } : {},
				onClose: () => setCheckoutTable(null),
				onConfirm: handleQuickCheckout
			})
		]
	});
}
//#endregion
export { EmporterPage as component };
