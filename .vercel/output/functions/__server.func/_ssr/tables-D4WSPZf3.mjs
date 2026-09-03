import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as useMenuStore, o as useSessionStore } from "./menuStore-CFwYtg9E.mjs";
import { g as Link, l as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as DialogOverlay$1, c as require_react_dom, i as DialogDescription$1, n as DialogClose, o as DialogPortal$1, r as DialogContent$1, s as DialogTitle$1, t as Dialog$1 } from "../_libs/@radix-ui/react-dialog+[...].mjs";
import { A as CreditCard, F as CircleCheck, L as ChefHat, _ as Minus, f as Search, g as NotebookPen, l as ShoppingCart, m as Plus, p as Receipt, q as Armchair, s as Trash2, t as X, u as ShoppingBag, x as LogOut, z as ChartColumn } from "../_libs/lucide-react.mjs";
import { i as useTableStore, n as ComponentLoader, r as useTableOrdersStore } from "./router-DrkdTGnv.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tables-D4WSPZf3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom());
var nav$1 = [
	{
		label: "Tables",
		icon: Armchair,
		to: "/tables"
	},
	{
		label: "Emporter",
		icon: ShoppingBag,
		to: "/emporter"
	},
	{
		label: "Rapport",
		icon: ChartColumn,
		to: "/rapports"
	}
];
/**
* Panneau de navigation latéral :
*  - Mobile (< md)  : masqué (bottom nav prend le relais)
*  - Tablette (md)  : visible, icônes seules, largeur 72 px
*  - Desktop (≥ lg) : visible, icônes + labels, largeur 220 px
*/
function Sidebar(_props) {
	const location = useRouterState({ select: (s) => s.location.pathname });
	const { tables, rooms } = useTableStore();
	const currentUser = useSessionStore((s) => s.currentUser);
	const logoutUser = useSessionStore((s) => s.logoutUser);
	const role = currentUser?.role ?? "caisse";
	const emporterRoom = rooms.find((r) => r.name.toLowerCase() === "emporter");
	const activeEmporterCount = emporterRoom ? tables.filter((t) => t.roomId === emporterRoom.id && t.status !== "libre").length : 0;
	const filteredNav = role === "serveur" ? nav$1.filter((item) => item.label !== "Rapport") : nav$1;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "hidden md:flex md:w-[72px] lg:w-[220px] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-16 items-center justify-center gap-3 px-3 lg:justify-start lg:px-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChefHat, { className: "h-5 w-5 text-primary-foreground" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "hidden truncate text-sm font-extrabold tracking-tight lg:block",
					children: "LA VIDA FOOD"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "mt-2 flex flex-1 flex-col px-2 lg:px-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-1 flex-col justify-center gap-1",
					children: filteredNav.map((item) => {
						const active = location === item.to;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: item.to,
							title: item.label,
							className: active ? "relative flex items-center justify-center gap-3 rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground lg:justify-start" : "relative flex items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:justify-start",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(item.icon, { className: "h-5 w-5 shrink-0" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden truncate lg:block",
									children: item.label
								}),
								item.label === "Emporter" && activeEmporterCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "absolute right-1 top-1 flex h-4 w-4 lg:h-5 lg:w-5 items-center justify-center rounded-full bg-orange-500 text-[9px] lg:text-[10px] font-bold text-white shadow-sm lg:right-3 lg:top-1/2 lg:-translate-y-1/2 ring-2 ring-sidebar",
									children: activeEmporterCount
								})
							]
						}, item.label);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-sidebar-border p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-center gap-3 lg:justify-start",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-bold uppercase",
						children: role.substring(0, 2)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "hidden min-w-0 flex-1 lg:block",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "truncate text-sm font-semibold capitalize",
							children: role
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "flex items-center gap-1.5 text-xs text-sidebar-foreground/60",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-1.5 w-1.5 rounded-full bg-success" }), "En ligne"]
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					title: "Déconnexion",
					onClick: logoutUser,
					className: "mt-3 flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:justify-start",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "hidden lg:block",
						children: "Déconnexion"
					})]
				})]
			})
		]
	});
}
var nav = [
	{
		label: "Tables",
		icon: Armchair,
		to: "/tables"
	},
	{
		label: "Emporter",
		icon: ShoppingBag,
		to: "/emporter"
	},
	{
		label: "Rapport",
		icon: ChartColumn,
		to: "/rapports"
	}
];
function MobileBottomNav(_props) {
	const location = useRouterState({ select: (s) => s.location.pathname });
	const { tables, rooms } = useTableStore();
	const role = useSessionStore((s) => s.currentUser)?.role ?? "caisse";
	const emporterRoom = rooms.find((r) => r.name.toLowerCase() === "emporter");
	const activeEmporterCount = emporterRoom ? tables.filter((t) => t.roomId === emporterRoom.id && t.status !== "libre").length : 0;
	const filteredNav = role === "serveur" ? nav.filter((item) => item.label !== "Rapport") : nav;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		className: "fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-10 border-t border-border bg-sidebar px-2 pb-safe pt-2 md:hidden",
		children: filteredNav.map((item) => {
			const active = location === item.to;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: item.to,
				className: `relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${active ? "text-primary" : "text-sidebar-foreground/50"}`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(item.icon, { className: "h-5 w-5" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[10px] font-medium",
						children: item.label
					}),
					item.label === "Emporter" && activeEmporterCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "absolute -top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-sidebar",
						children: activeEmporterCount
					})
				]
			}, item.label);
		})
	});
}
function CategoryTabs({ active, onChange, categories }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex overflow-x-auto gap-3 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
		children: categories.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => onChange(category),
			className: category === active ? "h-20 w-20 shrink-0 rounded-full bg-primary flex items-center justify-center p-2 text-xs text-center font-semibold text-primary-foreground shadow-md transition-transform active:scale-95" : "h-20 w-20 shrink-0 rounded-full border border-border bg-card flex items-center justify-center p-2 text-xs text-center font-medium text-muted-foreground shadow-sm transition-all hover:border-primary hover:text-foreground active:scale-95",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "line-clamp-2 leading-tight",
				children: category
			})
		}, category))
	});
}
var supplements = [
	{
		id: "cheese",
		label: "Fromage",
		price: 100
	},
	{
		id: "egg",
		label: "Œuf",
		price: 100
	},
	{
		id: "bacon",
		label: "Bacon",
		price: 150
	}
];
function formatDA(amount) {
	return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} DA`;
}
function ProductCard({ product, onSelect, readOnly = false }) {
	const inner = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative aspect-[4/3] overflow-hidden bg-muted",
		children: [product.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: product.image,
			alt: product.name,
			loading: "lazy",
			width: 512,
			height: 512,
			className: "h-full w-full object-cover"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex h-full w-full items-center justify-center text-muted-foreground/30",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				className: "h-10 w-10",
				fill: "none",
				viewBox: "0 0 24 24",
				stroke: "currentColor",
				strokeWidth: 1,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					strokeLinecap: "round",
					strokeLinejoin: "round",
					d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
				})
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: product.available ? "absolute right-2 top-2 rounded-md bg-success px-2 py-0.5 text-[11px] font-semibold text-primary-foreground" : "absolute right-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground",
			children: product.available ? "Disponible" : "Indisponible"
		})]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col gap-1 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "truncate text-sm font-semibold text-foreground",
				children: product.name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground",
				children: product.category
			}),
			product.options && product.options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-1 mt-0.5",
				children: product.options.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground",
					children: [
						opt.label,
						" â€” ",
						formatDA(opt.price)
					]
				}, opt.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-auto flex items-center justify-between pt-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-base font-bold text-primary",
					children: product.options && product.options.length > 0 ? `DÃ¨s ${formatDA(Math.min(...product.options.map((o) => o.price)))}` : formatDA(product.price)
				}), !readOnly && product.available && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: (e) => {
						e.stopPropagation();
						onSelect?.(product);
					},
					className: "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all active:scale-90 md:opacity-0 md:group-hover:opacity-100 md:scale-90 md:group-hover:scale-100",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
						className: "h-4 w-4",
						strokeWidth: 2.5
					})
				})]
			})
		]
	})] });
	if (readOnly) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left opacity-[0.97]",
		children: inner
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "button",
		tabIndex: product.available ? 0 : void 0,
		onClick: () => {
			if (product.available) onSelect?.(product);
		},
		onKeyDown: (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				if (product.available) onSelect?.(product);
			}
		},
		className: `group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all ${product.available ? "cursor-pointer hover:border-primary hover:shadow-md" : "cursor-not-allowed opacity-55 hover:border-border"}`,
		children: inner
	});
}
function ProductGrid({ products, onSelect, readOnly = false }) {
	if (products.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-dashed border-border bg-card p-10 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm font-semibold text-foreground",
			children: "Aucun produit trouvé"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-xs text-muted-foreground",
			children: "Essayez un autre nom ou une autre catégorie."
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4",
		children: products.map((product) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductCard, {
			product,
			onSelect,
			readOnly
		}, product.id))
	});
}
function ProductSearch({ value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			value,
			onChange: (e) => onChange(e.target.value),
			placeholder: "Rechercher un produit...",
			className: "h-12 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
		})]
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var Dialog = Dialog$1;
var DialogPortal = DialogPortal$1;
var DialogOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay$1, {
	ref,
	className: cn("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props
}));
DialogOverlay.displayName = DialogOverlay$1.displayName;
var DialogContent = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent$1, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg", className),
	...props,
	children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogClose, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "sr-only",
			children: "Close"
		})]
	})]
})] }));
DialogContent.displayName = DialogContent$1.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className),
	...props
});
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
DialogFooter.displayName = "DialogFooter";
var DialogTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle$1, {
	ref,
	className: cn("text-lg font-semibold leading-none tracking-tight", className),
	...props
}));
DialogTitle.displayName = DialogTitle$1.displayName;
var DialogDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription$1, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
DialogDescription.displayName = DialogDescription$1.displayName;
function ModifierModal({ item, open, onOpenChange, onConfirm }) {
	const [selected, setSelected] = (0, import_react.useState)([]);
	const [note, setNote] = (0, import_react.useState)("");
	const [customPrice, setCustomPrice] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		if (item) {
			setSelected(item.supplements.map((s) => s.id));
			setNote(item.note ?? "");
			setCustomPrice(item.customPrice !== void 0 ? item.customPrice.toString() : "");
		}
	}, [item]);
	const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "sm:max-w-md",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, { children: ["Modifier ", item?.product.name] }) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm font-semibold text-foreground",
							children: "Suppléments"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-2",
							children: supplements.map((supplement) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-3 text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "flex items-center gap-3 text-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: selected.includes(supplement.id),
										onChange: () => toggle(supplement.id),
										className: "h-4 w-4 accent-primary"
									}), supplement.label]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "font-semibold text-primary",
									children: ["+", formatDA(supplement.price)]
								})]
							}, supplement.id))
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm font-semibold text-foreground",
							children: "Note"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: note,
							onChange: (e) => setNote(e.target.value),
							placeholder: "Sans oignons",
							className: "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-sm font-semibold text-foreground",
							children: "Modifier le prix (Optionnel)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "number",
							min: "0",
							value: customPrice,
							onChange: (e) => setCustomPrice(e.target.value),
							placeholder: `Prix de base : ${formatDA(item?.selectedOption ? item.selectedOption.price : item?.product.price || 0)}`,
							className: "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
						})] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onOpenChange(false),
					className: "h-11 rounded-lg border border-border px-5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
					children: "Annuler"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						if (item) {
							const parsedPrice = customPrice.trim() !== "" ? parseFloat(customPrice) : void 0;
							onConfirm(item.id, supplements.filter((s) => selected.includes(s.id)), note, parsedPrice && !isNaN(parsedPrice) ? parsedPrice : void 0);
						}
					},
					className: "h-11 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90",
					children: "Mettre à jour"
				})] })
			]
		})
	});
}
function lineTotal(item) {
	const extras = item.supplements.reduce((sum, s) => sum + s.price, 0);
	let basePrice = item.selectedOption ? item.selectedOption.price : item.product.price;
	if (item.customPrice !== void 0) basePrice = item.customPrice;
	return (basePrice + extras) * item.quantity;
}
function cartSubtotal(items) {
	return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
function CheckoutReceiptModal({ open, tableNumber, items, orderNote, onClose, onConfirm }) {
	const confirmRef = (0, import_react.useRef)(null);
	const subtotal = cartSubtotal(items);
	const itemCount = items.reduce((s, i) => s + i.quantity, 0);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const handler = (e) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onClose]);
	(0, import_react.useEffect)(() => {
		if (open) document.body.style.overflow = "hidden";
		else document.body.style.overflow = "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [open]);
	if (!open) return null;
	const now = /* @__PURE__ */ new Date();
	const dateStr = now.toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "long",
		year: "numeric"
	});
	const timeStr = now.toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit"
	});
	return (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 flex items-center justify-center p-4",
		style: { zIndex: 9999 },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "absolute inset-0 bg-black/70 backdrop-blur-sm",
			onClick: onClose
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative flex w-full max-w-md flex-col rounded-2xl bg-background shadow-2xl overflow-hidden",
			style: {
				zIndex: 1e4,
				maxHeight: "90vh"
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-10 w-10 items-center justify-center rounded-xl bg-success/15",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receipt, { className: "h-5 w-5 text-success" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-base font-bold text-foreground",
							children: "Récapitulatif"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted-foreground",
							children: ["Table ", tableNumber]
						})] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onClose,
						className: "grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex-1 overflow-y-auto",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between bg-muted/40 px-5 py-2.5 text-[11px] text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: dateStr }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: timeStr })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "divide-y divide-border/60 px-5",
							children: items.map((item) => {
								const basePrice = item.customPrice !== void 0 ? item.customPrice : item.selectedOption ? item.selectedOption.price : item.product.price;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "py-3.5",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-start justify-between gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0 flex-1",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: "text-sm font-semibold text-foreground",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
															className: "mr-2 text-muted-foreground",
															children: [item.quantity, "×"]
														}),
														item.product.name,
														item.selectedOption && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
															className: "ml-1.5 text-xs font-normal text-muted-foreground",
															children: [
																"(",
																item.selectedOption.label,
																")"
															]
														})
													]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: "mt-0.5 text-xs text-muted-foreground",
													children: [
														formatDA(basePrice),
														" / unité",
														item.customPrice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
															children: "prix modifié"
														})
													]
												}),
												item.supplements.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "mt-1.5 flex flex-wrap gap-1",
													children: item.supplements.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
														className: "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary",
														children: [
															"+ ",
															s.label,
															" ",
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
																className: "opacity-70",
																children: [
																	"(",
																	formatDA(s.price),
																	")"
																]
															})
														]
													}, s.id))
												}),
												item.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: "mt-1 text-[11px] italic text-muted-foreground",
													children: ["✎ ", item.note]
												})
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "shrink-0 text-sm font-bold text-foreground",
											children: formatDA(lineTotal(item))
										})]
									})
								}, item.id);
							})
						}),
						orderNote && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mx-5 mb-4 mt-2 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotebookPen, { className: "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs italic text-muted-foreground",
								children: orderNote
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "shrink-0 border-t border-border bg-card px-5 py-4 space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex items-center justify-between text-sm text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
								itemCount,
								" article",
								itemCount > 1 ? "s" : ""
							] })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "border-t-2 border-dashed border-border" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-base font-bold text-foreground",
								children: "Total"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-2xl font-extrabold text-success",
								children: formatDA(subtotal)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							ref: confirmRef,
							type: "button",
							onClick: onConfirm,
							className: "flex w-full items-center justify-center gap-2.5 rounded-2xl bg-success py-4 text-base font-bold text-success-foreground shadow-lg transition-all active:scale-[0.98]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-5 w-5" }),
								"Encaisser",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "h-4 w-4 opacity-80" })
							]
						})
					]
				})
			]
		})]
	}), document.body);
}
function OptionSelectModal({ product, onConfirm, onClose }) {
	const [selected, setSelected] = (0, import_react.useState)(product.options?.[0] ?? null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4",
		onClick: (e) => {
			if (e.target === e.currentTarget) onClose();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200",
			children: [product.image && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative h-40 w-full overflow-hidden bg-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: product.image,
						alt: product.name,
						className: "h-full w-full object-cover"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onClose,
						className: "absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "p-4 flex flex-col gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-base font-bold text-foreground",
							children: product.name
						}), product.ingredients && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-xs text-muted-foreground line-clamp-2",
							children: product.ingredients
						})] }), !product.image && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: onClose,
							className: "shrink-0 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
						children: "Choisissez une option"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 gap-2",
						children: product.options.map((opt) => {
							const isSelected = selected?.label === opt.label;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setSelected(opt),
								className: `flex flex-col items-center gap-0.5 rounded-xl border-2 px-3 py-3 transition-all ${isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-muted"}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`,
									children: opt.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-xs font-semibold ${isSelected ? "text-primary/80" : "text-muted-foreground"}`,
									children: formatDA(opt.price)
								})]
							}, opt.label);
						})
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: !selected,
						onClick: () => selected && onConfirm(selected),
						className: "w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors",
						children: selected ? `Ajouter — ${formatDA(selected.price)}` : "Sélectionnez une option"
					})
				]
			})]
		})
	});
}
function OrderNoteInput({ value, onChange }) {
	const [localNote, setLocalNote] = (0, import_react.useState)(value);
	const onChangeRef = (0, import_react.useRef)(onChange);
	onChangeRef.current = onChange;
	(0, import_react.useEffect)(() => {
		setLocalNote(value);
	}, [value]);
	(0, import_react.useEffect)(() => {
		if (localNote !== value) {
			const timer = setTimeout(() => {
				onChangeRef.current(localNote);
			}, 400);
			return () => clearTimeout(timer);
		}
	}, [localNote, value]);
	const handleBlur = () => {
		if (localNote !== value) onChangeRef.current(localNote);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		value: localNote,
		onChange: (e) => setLocalNote(e.target.value),
		onBlur: handleBlur,
		placeholder: "Allergie, instructions spéciales…",
		rows: 2,
		className: "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary transition-colors"
	});
}
function CartItemsMobile({ items, decrease, increase, remove }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-2",
		children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 rounded-xl border border-border bg-background p-2.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "truncate text-xs font-semibold text-foreground",
							children: [item.product.name, item.selectedOption && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-1 font-normal text-muted-foreground",
								children: [
									"(",
									item.selectedOption.label,
									")"
								]
							})]
						}),
						item.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "truncate text-[10px] italic text-muted-foreground",
							children: [
								"\"",
								item.note,
								"\""
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] font-bold text-primary",
							children: formatDA(lineTotal(item))
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => decrease(item.id),
							className: "grid h-6 w-6 place-items-center rounded-md border border-border text-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { className: "h-3 w-3" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-5 text-center text-xs font-bold text-foreground",
							children: item.quantity
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => increase(item.id),
							className: "grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" })
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => remove(item.id),
					className: "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
				})
			]
		}, item.id))
	});
}
function OrderListDesktop({ tableNumber, mergedNumbers, items, orderNote, itemCount, total, isOccupied, isServeur, decrease, increase, remove, onNoteChange, onValidate, onCheckout }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-between border-b border-border bg-card px-4 py-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-base font-bold text-foreground",
					children: "Commande"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-muted-foreground",
						children: ["Table ", tableNumber]
					}), mergedNumbers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200",
						children: ["+ ", mergedNumbers]
					})]
				})] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex-1 overflow-y-auto p-3",
				children: items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-16 w-16 place-items-center rounded-full bg-muted",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingCart, { className: "h-7 w-7 text-muted-foreground" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-bold text-foreground",
						children: "Aucun produit"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 text-xs text-muted-foreground",
						children: "Sélectionnez des produits pour démarrer."
					})] })]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "space-y-2",
					children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "truncate text-sm font-semibold text-foreground",
										children: [item.product.name, item.selectedOption && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "ml-1 font-normal text-muted-foreground",
											children: [
												"(",
												item.selectedOption.label,
												")"
											]
										})]
									}),
									item.note && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "truncate text-xs italic text-muted-foreground",
										children: [
											"\"",
											item.note,
											"\""
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs font-bold text-primary",
										children: formatDA(lineTotal(item))
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => decrease(item.id),
										className: "grid h-7 w-7 place-items-center rounded-md border border-border text-foreground transition-colors hover:bg-muted",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { className: "h-3.5 w-3.5" })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "w-6 text-center text-sm font-bold text-foreground",
										children: item.quantity
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => increase(item.id),
										className: "grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3.5 w-3.5" })
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => remove(item.id),
								className: "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
							})
						]
					}, item.id))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border bg-card p-4 space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotebookPen, { className: "h-3.5 w-3.5" }), "Note de commande"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrderNoteInput, {
						value: orderNote,
						onChange: onNoteChange
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-sm text-muted-foreground",
							children: [
								itemCount,
								" article",
								itemCount > 1 ? "s" : ""
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-lg font-extrabold text-foreground",
							children: formatDA(total)
						})]
					}),
					isOccupied ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: onValidate,
							disabled: items.length === 0,
							className: "flex-1 rounded-xl bg-secondary py-3.5 text-sm font-bold text-secondary-foreground shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed",
							children: "Mettre à jour"
						}), !isServeur && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: onCheckout,
							className: "flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-bold text-success-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-4 w-4" }), "Encaisser"]
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: onValidate,
						disabled: items.length === 0,
						className: "w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed",
						children: "Valider la commande"
					})
				]
			})
		]
	});
}
function ProductSelectorDesktop({ tableNumber, mergedNumbers, query, category, allCategoryNames, visibleProducts, loading, onClose, onQueryChange, onCategoryChange, onProductSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col overflow-hidden",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between border-b border-border bg-card px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "text-lg font-bold text-foreground",
						children: ["Table ", tableNumber]
					}), mergedNumbers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200",
						children: ["Fusionnée avec: ", mergedNumbers]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted-foreground",
					children: "Sélection des produits"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: onClose,
					className: "rounded-full p-2 hover:bg-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5 text-muted-foreground" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-b border-border px-4 py-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CategoryTabs, {
					active: category,
					onChange: onCategoryChange,
					categories: allCategoryNames
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "flex-1 overflow-y-auto p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductSearch, {
						value: query,
						onChange: onQueryChange
					})
				}), loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComponentLoader, {}) : visibleProducts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-xl border border-dashed border-border bg-card p-10 text-center",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-semibold text-foreground",
						children: "Aucun produit"
					})
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductGrid, {
					products: visibleProducts,
					onSelect: onProductSelect
				})]
			})
		]
	});
}
function TableOrderSidebar({ tableId, tableNumber, mergedIds, onClose }) {
	const { tables, updateTable } = useTableStore();
	const isOccupied = tables.find((t) => t.id === tableId)?.status === "occupee";
	const isServeur = useSessionStore((s) => s.currentUser)?.role === "serveur";
	const mergedNumbers = mergedIds && mergedIds.length > 0 ? mergedIds.map((id) => tables.find((t) => t.id === id)?.number).filter(Boolean).join(", ") : null;
	const { orders, orderNotes, setOrder, setOrderNote, clearOrder } = useTableOrdersStore();
	const [category, setCategory] = (0, import_react.useState)("Tous");
	const [query, setQuery] = (0, import_react.useState)("");
	const [items, setItems] = (0, import_react.useState)(orders[tableId] || []);
	const [orderNote, setOrderNote_] = (0, import_react.useState)(orderNotes[tableId] || "");
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [modifierOpen, setModifierOpen] = (0, import_react.useState)(false);
	const [optionProduct, setOptionProduct] = (0, import_react.useState)(null);
	const [checkoutOpen, setCheckoutOpen] = (0, import_react.useState)(false);
	const [cartOpen, setCartOpen] = (0, import_react.useState)(isOccupied);
	const { products, allCategoryNames, loading } = useMenuStore();
	(0, import_react.useEffect)(() => {
		setOrder(tableId, items);
	}, [
		items,
		tableId,
		setOrder
	]);
	(0, import_react.useEffect)(() => {
		setOrderNote(tableId, orderNote);
	}, [
		orderNote,
		tableId,
		setOrderNote
	]);
	const visibleProducts = (0, import_react.useMemo)(() => {
		const term = query.trim().toLowerCase();
		return products.filter((product) => {
			const matchesCategory = category === "Tous" || product.category === category;
			const matchesTerm = term.length === 0 || product.name.toLowerCase().includes(term) || product.category.toLowerCase().includes(term);
			return matchesCategory && matchesTerm;
		});
	}, [
		category,
		query,
		products
	]);
	const handleProductSelect = (0, import_react.useCallback)((product) => {
		if (product.options && product.options.length > 0) setOptionProduct(product);
		else addProduct(product);
	}, []);
	const addProduct = (product, selectedOption) => {
		setItems((prev) => {
			const existing = prev.find((item) => item.product.id === product.id && item.supplements.length === 0 && !item.note && item.selectedOption?.label === selectedOption?.label);
			if (existing) return prev.map((item) => item.id === existing.id ? {
				...item,
				quantity: item.quantity + 1
			} : item);
			return [...prev, {
				id: `${product.id}-${Date.now()}`,
				product,
				quantity: 1,
				supplements: [],
				selectedOption
			}];
		});
	};
	const increase = (0, import_react.useCallback)((id) => setItems((prev) => prev.map((item) => item.id === id ? {
		...item,
		quantity: item.quantity + 1
	} : item)), []);
	const decrease = (0, import_react.useCallback)((id) => setItems((prev) => prev.flatMap((item) => item.id === id ? item.quantity > 1 ? [{
		...item,
		quantity: item.quantity - 1
	}] : [] : [item])), []);
	const remove = (0, import_react.useCallback)((id) => setItems((prev) => prev.filter((item) => item.id !== id)), []);
	const confirmModifier = (id, supplements, note, customPrice) => {
		setItems((prev) => prev.map((item) => item.id === id ? {
			...item,
			supplements,
			note: note.trim() || void 0,
			customPrice
		} : item));
		setModifierOpen(false);
	};
	const handleValidateOrder = async () => {
		const total = cartSubtotal(items);
		const now = (/* @__PURE__ */ new Date()).toISOString();
		await updateTable(tableId, {
			status: "occupee",
			orderTotal: total,
			...isOccupied ? {} : { occupiedSince: now }
		});
		if (mergedIds && mergedIds.length > 0) {
			for (const mId of mergedIds) if (tables.find((t) => t.id === mId)?.status !== "occupee") await updateTable(mId, {
				status: "occupee",
				occupiedSince: now
			});
		}
		onClose();
	};
	const handleCheckout = async () => {
		clearOrder(tableId);
		setOrderNote_("");
		await updateTable(tableId, {
			status: "libre",
			orderTotal: 0,
			occupiedSince: null,
			parentTableId: null
		});
		const children = tables.filter((t) => t.parentTableId === tableId);
		for (const child of children) await updateTable(child.id, {
			status: "libre",
			occupiedSince: null,
			orderTotal: 0,
			parentTableId: null
		});
		onClose();
	};
	const total = cartSubtotal(items);
	const itemCount = items.reduce((s, i) => s + i.quantity, 0);
	const handleOpenCheckout = (0, import_react.useCallback)(() => setCheckoutOpen(true), []);
	const handleNoteChange = (0, import_react.useCallback)((note) => setOrderNote_(note), []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-full w-full max-w-5xl bg-background shadow-2xl animate-in slide-in-from-right",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "hidden md:flex md:flex-1 md:flex-col overflow-hidden",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductSelectorDesktop, {
							tableNumber,
							mergedNumbers,
							query,
							category,
							allCategoryNames,
							visibleProducts,
							loading,
							onClose,
							onQueryChange: setQuery,
							onCategoryChange: setCategory,
							onProductSelect: handleProductSelect
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "hidden md:flex md:w-[340px] md:shrink-0 md:flex-col border-l border-border overflow-hidden",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrderListDesktop, {
							tableNumber,
							mergedNumbers,
							items,
							orderNote,
							itemCount,
							total,
							isOccupied,
							isServeur,
							decrease,
							increase,
							remove,
							onNoteChange: handleNoteChange,
							onValidate: handleValidateOrder,
							onCheckout: handleOpenCheckout
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-1 flex-col overflow-hidden md:hidden",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
								className: "flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
										className: "text-base font-bold text-foreground",
										children: ["Table ", tableNumber]
									}), mergedNumbers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200",
										children: ["Fusion: ", mergedNumbers]
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-muted-foreground",
									children: "Prise de commande"
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: onClose,
									className: "rounded-full p-2 hover:bg-muted",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5 text-muted-foreground" })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "shrink-0 border-b border-border bg-card px-4 py-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CategoryTabs, {
									active: category,
									onChange: setCategory,
									categories: allCategoryNames
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "shrink-0 bg-background px-4 pt-2 pb-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductSearch, {
									value: query,
									onChange: setQuery
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex-1 overflow-y-auto px-4 pb-2",
								children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComponentLoader, {}) : visibleProducts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "rounded-xl border border-dashed border-border bg-card p-8 text-center",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm font-semibold text-foreground",
										children: "Aucun produit"
									})
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductGrid, {
									products: visibleProducts,
									onSelect: handleProductSelect
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "shrink-0 border-t-2 border-primary/30 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => setCartOpen((o) => !o),
									className: "flex w-full items-center justify-between px-4 py-3 transition-colors active:bg-muted/50",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/10",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingCart, { className: "h-4 w-4 text-primary" }), itemCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground",
												children: itemCount
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-left",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-sm font-bold text-foreground",
												children: itemCount > 0 ? `${itemCount} article${itemCount > 1 ? "s" : ""}` : "Panier vide"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[10px] text-muted-foreground",
												children: cartOpen ? "Appuyer pour fermer" : "Appuyer pour voir la commande"
											})]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-3",
										children: [itemCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-base font-extrabold text-primary",
											children: formatDA(total)
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-[10px] font-semibold text-muted-foreground transition-transform duration-200",
											style: {
												display: "inline-block",
												transform: cartOpen ? "rotate(180deg)" : "rotate(0deg)"
											},
											children: "▲"
										})]
									})]
								}), cartOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "border-t border-border",
									children: [
										items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-col items-center gap-2 py-6 text-center",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingCart, { className: "h-8 w-8 text-muted-foreground/50" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-xs text-muted-foreground",
												children: "Appuyez sur un produit pour l'ajouter"
											})]
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "max-h-[220px] overflow-y-auto p-3",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartItemsMobile, {
												items,
												decrease,
												increase,
												remove
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "border-t border-border px-3 pt-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												className: "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotebookPen, { className: "h-3.5 w-3.5" }), "Note de commande"]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrderNoteInput, {
												value: orderNote,
												onChange: setOrderNote_
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "border-t border-border p-3 pb-safe-bottom",
											children: isOccupied ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													onClick: handleValidateOrder,
													disabled: items.length === 0,
													className: "flex-1 rounded-xl bg-secondary py-3.5 text-sm font-bold text-secondary-foreground shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
													children: "Mettre à jour"
												}), !isServeur && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													onClick: () => setCheckoutOpen(true),
													className: "flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-bold text-success-foreground shadow-lg transition-all active:scale-[0.98]",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-4 w-4" }), "Encaisser"]
												})]
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: handleValidateOrder,
												disabled: items.length === 0,
												className: "flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "h-4 w-4" }),
													"Valider la commande",
													itemCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
														className: "ml-1 opacity-80",
														children: ["— ", formatDA(total)]
													})
												]
											})
										})
									]
								})]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModifierModal, {
				item: editing,
				open: modifierOpen,
				onOpenChange: setModifierOpen,
				onConfirm: confirmModifier
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckoutReceiptModal, {
				open: checkoutOpen,
				tableNumber,
				items,
				orderNote: orderNote || void 0,
				onClose: () => setCheckoutOpen(false),
				onConfirm: async () => {
					setCheckoutOpen(false);
					await handleCheckout();
				}
			}),
			optionProduct && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OptionSelectModal, {
				product: optionProduct,
				onClose: () => setOptionProduct(null),
				onConfirm: (option) => {
					addProduct(optionProduct, option);
					setOptionProduct(null);
				}
			})
		]
	});
}
(/* @__PURE__ */ new Date(Date.now() - 21e5)).toISOString(), (/* @__PURE__ */ new Date(Date.now() - 72e4)).toISOString(), (/* @__PURE__ */ new Date(Date.now() - 348e4)).toISOString(), (/* @__PURE__ */ new Date(Date.now() - 48e4)).toISOString();
function formatElapsed(since) {
	const diffMs = Date.now() - new Date(since).getTime();
	const mins = Math.floor(diffMs / 6e4);
	if (mins < 60) return `${mins} min`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}
//#endregion
export { formatDA as a, TableOrderSidebar as i, MobileBottomNav as n, formatElapsed as o, Sidebar as r, CheckoutReceiptModal as t };
