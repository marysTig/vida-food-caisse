import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { o as useSessionStore } from "./menuStore-CFwYtg9E.mjs";
import { _ as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { G as Ban, I as CircleAlert, L as ChefHat, N as Clock, O as Eye, R as Check, S as Lock, b as MapPin, i as User, k as EyeOff, q as Armchair, r as Users, u as ShoppingBag, v as Merge } from "../_libs/lucide-react.mjs";
import { i as useTableStore, n as ComponentLoader, r as useTableOrdersStore } from "./router-1yb7JpPf.mjs";
import { a as formatDA, i as TableOrderSidebar, n as MobileBottomNav, o as formatElapsed, r as Sidebar, t as CheckoutReceiptModal } from "./tables-BerwWIFt.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tables-CiLHtV2v.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function UserLogin() {
	const [username, setUsername] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [showPassword, setShowPassword] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [isShaking, setIsShaking] = (0, import_react.useState)(false);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const inputRef = (0, import_react.useRef)(null);
	const loginUser = useSessionStore((s) => s.loginUser);
	const navigate = useNavigate();
	(0, import_react.useEffect)(() => {
		inputRef.current?.focus();
	}, []);
	async function handleSubmit(e) {
		e.preventDefault();
		if (!username.trim() || !password.trim()) return;
		setIsLoading(true);
		setError("");
		const result = await loginUser(username, password);
		if (result.ok) {
			if (result.isAdmin) navigate({ to: "/admin" });
			else navigate({ to: "/tables" });
			return;
		}
		setIsLoading(false);
		setError(result.error ?? "Erreur de connexion.");
		setIsShaking(true);
		setPassword("");
		setTimeout(() => setIsShaking(false), 600);
		inputRef.current?.focus();
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "admin-login-root",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "blob blob-1" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "blob blob-2" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "blob blob-3" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: `admin-login-card ${isShaking ? "shake" : ""}`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "admin-login-brand",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "admin-login-icon-ring",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChefHat, { className: "admin-login-chef-icon" })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "admin-login-title",
								children: "La Vida Food"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "admin-login-subtitle",
								children: "Connexion Employé"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmit,
						className: "admin-login-form mt-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "admin-login-label",
									htmlFor: "pos-username",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(User, { size: 13 }), "Nom d'utilisateur"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "admin-login-input-wrap",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "pos-username",
										type: "text",
										value: username,
										onChange: (e) => {
											setUsername(e.target.value);
											setError("");
										},
										placeholder: "ex: marie",
										className: "admin-login-input",
										autoComplete: "username"
									})
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-1 mt-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "admin-login-label",
									htmlFor: "pos-password",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { size: 13 }), "Mot de passe"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "admin-login-input-wrap",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "pos-password",
										ref: inputRef,
										type: showPassword ? "text" : "password",
										value: password,
										onChange: (e) => {
											setPassword(e.target.value);
											setError("");
										},
										placeholder: "••••••••",
										className: "admin-login-input pr-10",
										autoComplete: "current-password"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "admin-login-eye",
										onClick: () => setShowPassword((v) => !v),
										tabIndex: -1,
										"aria-label": showPassword ? "Masquer" : "Afficher",
										children: showPassword ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { size: 16 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 16 })
									})]
								})]
							}),
							error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-login-error mt-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: error })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "submit",
								className: "admin-login-btn mt-4",
								disabled: isLoading || !username.trim() || !password.trim(),
								children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "admin-login-spinner" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									style: { marginLeft: 8 },
									children: "Connexion…"
								})] }) : "Se connecter"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "admin-login-footer mt-4",
						children: [
							"© ",
							(/* @__PURE__ */ new Date()).getFullYear(),
							" La Vida Food · Système de caisse"
						]
					})
				]
			})
		]
	});
}
var statusConfig = {
	libre: {
		label: "Libre",
		color: "text-emerald-700 dark:text-emerald-400",
		bg: "bg-emerald-100 dark:bg-emerald-950/60",
		border: "border-emerald-300 dark:border-emerald-700",
		dot: "bg-emerald-500"
	},
	occupee: {
		label: "Occupée",
		color: "text-orange-700 dark:text-orange-400",
		bg: "bg-orange-100 dark:bg-orange-950/60",
		border: "border-orange-300 dark:border-orange-700",
		dot: "bg-orange-500"
	},
	reservee: {
		label: "Réservée",
		color: "text-blue-700 dark:text-blue-400",
		bg: "bg-blue-100 dark:bg-blue-950/60",
		border: "border-blue-300 dark:border-blue-700",
		dot: "bg-blue-500"
	}
};
var filters = [
	{
		label: "Toutes",
		value: "toutes"
	},
	{
		label: "Libres",
		value: "libre"
	},
	{
		label: "Occupées",
		value: "occupee"
	},
	{
		label: "Réservées",
		value: "reservee"
	}
];
function TableCard({ table, roomName, isActive, onStatusChange, onSelect, onEncaisser, isMergingMode, isSelectedForMerge, mergedWithNumbers, isServeur }) {
	const cfg = statusConfig[table.status];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		"data-table-id": table.id,
		onClick: () => onSelect(table.id, table.number),
		className: `relative flex cursor-pointer flex-col gap-2 rounded-3xl border-2 border-b-[6px] p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:translate-y-1 active:border-b-[2px] active:scale-[0.98]
        ${cfg.bg} ${cfg.border}
        ${isActive ? "ring-4 ring-primary ring-offset-2 shadow-lg border-b-[4px] -translate-y-0.5" : "shadow-sm"}
        ${isSelectedForMerge ? "ring-4 ring-blue-500 ring-offset-2 shadow-lg border-blue-500 bg-blue-50 dark:bg-blue-900/30" : ""}`,
		children: [
			isMergingMode && isSelectedForMerge && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute right-3 top-3 rounded-full bg-blue-500 p-1 text-white shadow-md",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-start justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium text-muted-foreground",
						children: "Table"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-2xl font-extrabold text-foreground leading-none mt-0.5",
							children: table.number
						}), mergedWithNumbers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "shrink-0 whitespace-nowrap text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200",
							title: "Table fusionnée",
							children: ["F ", mergedWithNumbers]
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: `shrink-0 flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold bg-white/80 dark:bg-black/40 ${cfg.color} ${cfg.border}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `shrink-0 h-1.5 w-1.5 rounded-full ${cfg.dot}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "whitespace-nowrap",
						children: cfg.label
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-3 text-xs text-muted-foreground",
				children: [roomName && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "h-3.5 w-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-medium",
						children: roomName
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3.5 w-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [table.seats, " places"] })]
				})]
			}),
			table.status === "occupee" && table.occupiedSince && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
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
			!isMergingMode && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-auto flex flex-wrap gap-2 pt-1",
				onClick: (e) => e.stopPropagation(),
				children: [
					table.status === "libre" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onStatusChange(table.id, "reservee"),
						className: "flex-1 rounded-lg border border-blue-200 bg-blue-50 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 active:scale-95 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
						children: "Réserver"
					}),
					table.status === "occupee" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [!isServeur && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onEncaisser(table.id, table.number),
						className: "flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-95",
						children: "Encaisser"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onStatusChange(table.id, "libre"),
						className: `${isServeur ? "flex-1 flex justify-center items-center " : ""}rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive active:scale-95`,
						title: "Libérer sans récapitulatif",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { className: "h-3.5 w-3.5" })
					})] }),
					table.status === "reservee" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onStatusChange(table.id, "occupee"),
						className: "flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95",
						children: "Placer"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => onStatusChange(table.id, "libre"),
						className: "rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive active:scale-95",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { className: "h-3.5 w-3.5" })
					})] })
				]
			})
		]
	});
}
function MergedTableLines({ tables }) {
	const [lines, setLines] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		const updateLines = () => {
			const newLines = [];
			const container = document.querySelector("main");
			if (!container) return;
			const containerRect = container.getBoundingClientRect();
			tables.forEach((table) => {
				if (table.parentTableId) {
					const childEl = document.querySelector(`[data-table-id="${table.id}"]`);
					const parentEl = document.querySelector(`[data-table-id="${table.parentTableId}"]`);
					if (childEl && parentEl) {
						const childRect = childEl.getBoundingClientRect();
						const parentRect = parentEl.getBoundingClientRect();
						const childX = childRect.left - containerRect.left + childRect.width / 2 + container.scrollLeft;
						const childY = childRect.top - containerRect.top + childRect.height / 2 + container.scrollTop;
						const parentX = parentRect.left - containerRect.left + parentRect.width / 2 + container.scrollLeft;
						const parentY = parentRect.top - containerRect.top + parentRect.height / 2 + container.scrollTop;
						newLines.push({
							id: table.id,
							x1: parentX,
							y1: parentY,
							x2: childX,
							y2: childY
						});
					}
				}
			});
			setLines(newLines);
		};
		const timer = setTimeout(updateLines, 50);
		window.addEventListener("resize", updateLines);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("resize", updateLines);
		};
	}, [tables]);
	if (lines.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		className: "pointer-events-none absolute inset-0 z-0 h-full w-full",
		style: { overflow: "visible" },
		children: lines.map((line) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
			x1: line.x1,
			y1: line.y1,
			x2: line.x2,
			y2: line.y2,
			stroke: "currentColor",
			strokeWidth: "6",
			strokeLinecap: "round",
			className: "text-blue-500 opacity-60"
		}, line.id))
	});
}
function TablesPage() {
	const { tables: tableData, loading: tablesLoading, updateTable, rooms, addRoom, addTable, mergeTablesDB } = useTableStore();
	const { orders, orderNotes, clearOrder, mergeOrders } = useTableOrdersStore();
	const currentUser = useSessionStore((s) => s.currentUser);
	const [filter, setFilter] = (0, import_react.useState)("toutes");
	const [activeTable, setActiveTable] = (0, import_react.useState)(null);
	const [checkoutTable, setCheckoutTable] = (0, import_react.useState)(null);
	const [multiCheckoutTables, setMultiCheckoutTables] = (0, import_react.useState)([]);
	const [isMerging, setIsMerging] = (0, import_react.useState)(false);
	const [selectedTables, setSelectedTables] = (0, import_react.useState)([]);
	const [isCreatingTakeaway, setIsCreatingTakeaway] = (0, import_react.useState)(false);
	const emporterRoom = rooms.find((r) => r.name.toLowerCase() === "emporter");
	const regularTables = tableData.filter((t) => !emporterRoom || t.roomId !== emporterRoom.id);
	const emporterTables = emporterRoom ? tableData.filter((t) => t.roomId === emporterRoom.id) : [];
	const activeEmporterCount = emporterTables.filter((t) => t.status !== "libre").length;
	const libre = regularTables.filter((t) => t.status === "libre").length;
	const occupee = regularTables.filter((t) => t.status === "occupee").length;
	const reservee = regularTables.filter((t) => t.status === "reservee").length;
	const visible = filter === "toutes" ? regularTables : regularTables.filter((t) => t.status === filter);
	const handleTakeawayClick = async () => {
		setIsCreatingTakeaway(true);
		try {
			let roomId = emporterRoom?.id;
			if (!roomId) roomId = await addRoom("Emporter");
			const freeTable = tableData.find((t) => t.roomId === roomId && t.status === "libre");
			if (freeTable) setActiveTable({
				id: freeTable.id,
				number: freeTable.number
			});
			else {
				const nextNumber = emporterTables.length + 1;
				const newTableId = await addTable({
					number: nextNumber,
					seats: 1,
					status: "libre",
					roomId
				});
				setActiveTable({
					id: newTableId,
					number: nextNumber
				});
			}
		} catch (error) {
			console.error("Erreur création emporter:", error);
		} finally {
			setIsCreatingTakeaway(false);
		}
	};
	const handleStatusChange = (0, import_react.useCallback)(async (id, status) => {
		const payload = { status };
		if (status === "occupee") {
			payload.occupiedSince = (/* @__PURE__ */ new Date()).toISOString();
			payload.orderTotal = 0;
		} else {
			payload.occupiedSince = null;
			payload.orderTotal = 0;
			payload.parentTableId = null;
		}
		await updateTable(id, payload);
		if (status === "libre") {
			const children = tableData.filter((t) => t.parentTableId === id);
			for (const child of children) await updateTable(child.id, {
				status: "libre",
				occupiedSince: null,
				orderTotal: 0,
				parentTableId: null
			});
		}
	}, [updateTable, tableData]);
	const handleSelectTable = (0, import_react.useCallback)((id, number) => {
		if (isMerging) {
			setSelectedTables((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
			return;
		}
		const clickedTable = tableData.find((t) => t.id === id);
		if (!clickedTable) return;
		let targetId = id;
		let targetNumber = number;
		if (clickedTable.parentTableId) {
			const parent = tableData.find((t) => t.id === clickedTable.parentTableId);
			if (parent) {
				targetId = parent.id;
				targetNumber = parent.number;
			}
		}
		const mergedIds = tableData.filter((t) => t.parentTableId === targetId).map((t) => t.id);
		if (activeTable?.id === targetId) setActiveTable(null);
		else setActiveTable({
			id: targetId,
			number: targetNumber,
			mergedIds
		});
	}, [
		isMerging,
		tableData,
		activeTable
	]);
	const handleCheckoutClick = (0, import_react.useCallback)((id, number) => {
		const clickedTable = tableData.find((t) => t.id === id);
		if (!clickedTable) return;
		let targetId = id;
		let targetNumber = number;
		if (clickedTable.parentTableId) {
			const parent = tableData.find((t) => t.id === clickedTable.parentTableId);
			if (parent) {
				targetId = parent.id;
				targetNumber = parent.number;
			}
		}
		setCheckoutTable({
			id: targetId,
			number: targetNumber
		});
	}, [tableData]);
	const handleConfirmMerge = async () => {
		if (selectedTables.length < 2) return;
		const [primaryId, ...otherIds] = selectedTables;
		if (!primaryId) return;
		const primaryTable = tableData.find((t) => t.id === primaryId);
		mergeOrders(primaryId, otherIds);
		const totalAmountToAdd = tableData.filter((t) => otherIds.includes(t.id)).reduce((sum, t) => sum + (t.orderTotal || 0), 0);
		await mergeTablesDB(primaryId, otherIds, totalAmountToAdd);
		setIsMerging(false);
		setSelectedTables([]);
		if (primaryTable) setActiveTable({
			id: primaryId,
			number: primaryTable.number,
			mergedIds: otherIds
		});
	};
	const closePanel = () => setActiveTable(null);
	const handleQuickCheckout = async () => {
		if (!checkoutTable) return;
		clearOrder(checkoutTable.id);
		await updateTable(checkoutTable.id, {
			status: "libre",
			orderTotal: 0,
			occupiedSince: null,
			parentTableId: null
		});
		const children = tableData.filter((t) => t.parentTableId === checkoutTable.id);
		for (const child of children) await updateTable(child.id, {
			status: "libre",
			occupiedSince: null,
			orderTotal: 0,
			parentTableId: null
		});
		if (multiCheckoutTables.length > 0) {
			for (const id of multiCheckoutTables) {
				clearOrder(id);
				await updateTable(id, {
					status: "libre",
					orderTotal: 0,
					occupiedSince: null,
					parentTableId: null
				});
				const children = tableData.filter((t) => t.parentTableId === id);
				for (const child of children) await updateTable(child.id, {
					status: "libre",
					occupiedSince: null,
					orderTotal: 0,
					parentTableId: null
				});
			}
			setMultiCheckoutTables([]);
			setIsMerging(false);
			setSelectedTables([]);
		}
		setCheckoutTable(null);
	};
	const handleMultiCheckoutClick = () => {
		setMultiCheckoutTables(selectedTables);
	};
	let checkoutItems = checkoutTable ? orders[checkoutTable.id] ?? [] : [];
	let checkoutNote = checkoutTable ? orderNotes[checkoutTable.id] ?? void 0 : void 0;
	let checkoutTableNumber = checkoutTable?.number ?? 0;
	if (multiCheckoutTables.length > 0) {
		const combinedItems = [];
		const notes = [];
		multiCheckoutTables.forEach((id) => {
			if (orders[id]) combinedItems.push(...orders[id]);
			if (orderNotes[id]) notes.push(orderNotes[id]);
		});
		checkoutItems = combinedItems;
		checkoutNote = notes.length > 0 ? notes.join(" | ") : void 0;
		checkoutTableNumber = tableData.filter((t) => multiCheckoutTables.includes(t.id)).map((t) => t.number).join(", ");
	}
	if (!currentUser) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserLogin, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-screen overflow-hidden bg-background font-sans",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, { activePage: "tables" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-w-0 flex-1 flex-col overflow-hidden",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Armchair, { className: "h-5 w-5 text-primary-foreground" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-lg font-bold text-foreground",
							children: "Tables"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: "Plan de salle"
						})] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shrink-0 grid grid-cols-2 gap-3 border-b border-border bg-card px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: handleTakeawayClick,
							disabled: isCreatingTakeaway,
							className: "relative flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 transition-all hover:bg-orange-100 active:scale-[0.99] dark:border-orange-800 dark:bg-orange-950/40 disabled:opacity-50 disabled:cursor-wait",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, { className: "h-5 w-5 text-orange-600 dark:text-orange-400" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-sm font-bold text-orange-700 dark:text-orange-400",
									children: "À emporter"
								}),
								activeEmporterCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white shadow-sm ring-2 ring-background",
									children: activeEmporterCount
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => {
								setIsMerging(!isMerging);
								setSelectedTables([]);
							},
							className: `flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 transition-all active:scale-[0.99] ${isMerging ? "border-primary bg-primary/10 text-primary ring-2 ring-primary" : "border-border bg-background hover:bg-muted text-foreground"}`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Merge, { className: "h-5 w-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-bold",
								children: isMerging ? "Annuler Sélection" : "Sélection Multiple"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex shrink-0 justify-center gap-2 overflow-x-auto border-b border-border bg-card px-4 pb-3 pt-3 [&::-webkit-scrollbar]:hidden",
						children: filters.map((f) => {
							const count = f.value === "toutes" ? regularTables.length : f.value === "libre" ? libre : f.value === "occupee" ? occupee : reservee;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setFilter(f.value),
								className: `flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: f.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `flex h-5 items-center justify-center rounded-full px-2 text-[10px] ${filter === f.value ? "bg-background/20 text-primary-foreground" : "bg-background text-foreground"}`,
									children: count
								})]
							}, f.value);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
						className: "relative flex-1 overflow-y-auto p-4 pb-24 md:pb-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MergedTableLines, { tables: visible }), tablesLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComponentLoader, {}) : visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-dashed border-border bg-card p-10 text-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm font-semibold text-foreground",
								children: "Aucune table"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-xs text-muted-foreground",
								children: "Ajoutez des tables depuis le panneau admin."
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
							children: visible.map((table) => {
								const roomName = rooms.find((r) => r.id === table.roomId)?.name;
								let mergedWithNumbers;
								if (table.parentTableId) {
									const parent = tableData.find((t) => t.id === table.parentTableId);
									if (parent) mergedWithNumbers = `${parent.number}`;
								} else {
									const children = tableData.filter((t) => t.parentTableId === table.id);
									if (children.length > 0) mergedWithNumbers = children.map((t) => t.number).join(", ");
								}
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCard, {
									table,
									roomName,
									isActive: activeTable?.id === table.id,
									onStatusChange: handleStatusChange,
									onSelect: handleSelectTable,
									onEncaisser: handleCheckoutClick,
									isMergingMode: isMerging,
									isSelectedForMerge: selectedTables.includes(table.id),
									mergedWithNumbers,
									isServeur: currentUser?.role === "serveur"
								}, table.id);
							})
						})]
					}),
					isMerging && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shrink-0 border-t border-border bg-card p-4 pb-24 md:pb-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-bold text-foreground text-base sm:text-lg",
							children: [
								"Sélection (",
								selectedTables.length,
								")"
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs sm:text-sm text-muted-foreground",
							children: ["Total: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-semibold text-primary",
								children: formatDA(selectedTables.reduce((sum, id) => {
									return sum + (tableData.find((tb) => tb.id === id)?.orderTotal || 0);
								}, 0))
							})]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-row gap-2 w-full sm:w-auto",
							children: [selectedTables.length >= 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: handleConfirmMerge,
								className: "flex-1 sm:flex-none rounded-lg bg-blue-600 px-3 sm:px-6 py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-95 shadow-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "sm:hidden",
									children: "Fusionner"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: "Fusionner pour commander"
								})]
							}), selectedTables.length > 0 && currentUser?.role !== "serveur" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: handleMultiCheckoutClick,
								className: "flex-1 sm:flex-none rounded-lg bg-emerald-600 px-3 sm:px-6 py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 shadow-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "sm:hidden",
									children: "Encaisser"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: "Encaisser la sélection"
								})]
							})]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileBottomNav, { activePage: "tables" }),
			activeTable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableOrderSidebar, {
				tableId: activeTable.id,
				tableNumber: activeTable.number,
				mergedIds: activeTable.mergedIds,
				onClose: closePanel
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckoutReceiptModal, {
				open: checkoutTable !== null || multiCheckoutTables.length > 0,
				tableNumber: checkoutTableNumber,
				items: checkoutItems,
				...checkoutNote ? { orderNote: checkoutNote } : {},
				onClose: () => {
					setCheckoutTable(null);
					setMultiCheckoutTables([]);
				},
				onConfirm: handleQuickCheckout
			})
		]
	});
}
//#endregion
export { TablesPage as component };
