import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as useMenuStore, c as verifyAdminPassword, i as useAuthStore, r as updateAdminCredentials, s as useUsersStore, t as ADMIN_ROW_ID } from "./menuStore-CFwYtg9E.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { A as CreditCard, B as CassetteTape, C as LoaderCircle, D as Folder, E as Grid3x3, F as CircleCheck, H as Calendar, I as CircleAlert, K as ArrowLeft, L as ChefHat, M as CloudUpload, O as Eye, P as CircleUser, S as Lock, T as Image, U as Box, V as Camera, W as Banknote, a as UserPlus, c as Tag, d as ShieldCheck, h as Pen, i as User, j as Coffee, k as EyeOff, m as Plus, n as Utensils, o as TrendingUp, p as Receipt, q as Armchair, r as Users, s as Trash2, t as X, u as ShoppingBag, w as Layers, y as Menu, z as ChartColumn } from "../_libs/lucide-react.mjs";
import { i as useTableStore, o as supabase } from "./router-1yb7JpPf.mjs";
import { t as fr, u as format } from "../_libs/date-fns.mjs";
import { t as DayPicker } from "../_libs/react-day-picker.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin-CD0r8Tat.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
async function uploadImageToCloudinary(file) {
	const cloudName = "qyilxlht";
	const uploadPreset = "vidafood";
	const formData = new FormData();
	formData.append("file", file);
	formData.append("upload_preset", uploadPreset);
	const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
		method: "POST",
		body: formData
	});
	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.error?.message || "Erreur lors du téléchargement de l'image");
	}
	return (await response.json()).secure_url;
}
function ImageUploader({ value, onChange, className = "" }) {
	const [isUploading, setIsUploading] = (0, import_react.useState)(false);
	const [isDragging, setIsDragging] = (0, import_react.useState)(false);
	const fileInputRef = (0, import_react.useRef)(null);
	const cameraInputRef = (0, import_react.useRef)(null);
	const handleUpload = async (file) => {
		try {
			setIsUploading(true);
			onChange(await uploadImageToCloudinary(file));
		} catch (error) {
			alert(error.message);
		} finally {
			setIsUploading(false);
		}
	};
	const onFileChange = (e) => {
		const file = e.target.files?.[0];
		if (file) handleUpload(file);
	};
	const onDragOver = (e) => {
		e.preventDefault();
		setIsDragging(true);
	};
	const onDragLeave = (e) => {
		e.preventDefault();
		setIsDragging(false);
	};
	const onDrop = (e) => {
		e.preventDefault();
		setIsDragging(false);
		const file = e.dataTransfer.files?.[0];
		if (file && file.type.startsWith("image/")) handleUpload(file);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex flex-col gap-2 ${className}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden
          ${isDragging ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`,
			onDragOver,
			onDragLeave,
			onDrop,
			onClick: () => fileInputRef.current?.click(),
			children: isUploading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center gap-2 text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-sm font-medium",
					children: "Téléchargement..."
				})]
			}) : value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: value,
				alt: "Preview",
				className: "w-full h-full object-cover"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center gap-2 text-muted-foreground p-4 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloudUpload, { className: "h-8 w-8 opacity-50" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-sm font-medium",
					children: "Glissez une image ici ou cliquez"
				})]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "file",
					accept: "image/*",
					className: "hidden",
					ref: fileInputRef,
					onChange: onFileChange
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "file",
					accept: "image/*",
					capture: "environment",
					className: "hidden",
					ref: cameraInputRef,
					onChange: onFileChange
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => fileInputRef.current?.click(),
					className: "flex-1 flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { className: "h-4 w-4" }), " Galerie"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => cameraInputRef.current?.click(),
					className: "flex-1 flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "h-4 w-4" }), " Caméra"]
				})
			]
		})]
	});
}
function MenuManager() {
	const [view, setView] = (0, import_react.useState)("home");
	const { products, categories, loading, addCategory, updateCategory, deleteCategory, addProduct, updateProduct, deleteProduct } = useMenuStore();
	const [activeCategory, setActiveCategory] = (0, import_react.useState)("");
	const [newCatName, setNewCatName] = (0, import_react.useState)("");
	const [newCatImage, setNewCatImage] = (0, import_react.useState)("");
	const [isEditingCat, setIsEditingCat] = (0, import_react.useState)(null);
	const [isEditing, setIsEditing] = (0, import_react.useState)(null);
	const [showProductForm, setShowProductForm] = (0, import_react.useState)(false);
	const [saving, setSaving] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const effectiveCategory = activeCategory || categories[0]?.name || "";
	const handleAddCategory = async (e) => {
		e.preventDefault();
		if (!newCatName.trim()) return;
		setSaving(true);
		setError(null);
		try {
			if (isEditingCat && isEditingCat.id) {
				await updateCategory(isEditingCat.id, {
					name: newCatName.trim(),
					image: newCatImage.trim()
				});
				if (activeCategory === isEditingCat.name) setActiveCategory(newCatName.trim());
				setIsEditingCat(null);
			} else await addCategory({
				name: newCatName.trim(),
				image: newCatImage.trim()
			});
			setNewCatName("");
			setNewCatImage("");
		} catch (err) {
			setError(err.message ?? "Erreur lors de la sauvegarde");
		} finally {
			setSaving(false);
		}
	};
	const handleEditCategoryClick = (cat) => {
		setIsEditingCat(cat);
		setNewCatName(cat.name);
		setNewCatImage(cat.image || "");
	};
	const handleCancelEditCat = () => {
		setIsEditingCat(null);
		setNewCatName("");
		setNewCatImage("");
	};
	const handleDeleteCategory = async (cat) => {
		if (!cat.id) return;
		setSaving(true);
		setError(null);
		try {
			await deleteCategory(cat.id);
			if (activeCategory === cat.name) setActiveCategory(categories[0]?.name || "");
		} catch (err) {
			setError(err.message ?? "Erreur lors de la suppression");
		} finally {
			setSaving(false);
		}
	};
	const handleDeleteProduct = async (id) => {
		setSaving(true);
		setError(null);
		try {
			await deleteProduct(id);
		} catch (err) {
			setError(err.message ?? "Erreur lors de la suppression");
		} finally {
			setSaving(false);
		}
	};
	if (view === "home") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col items-center justify-center gap-10 p-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-2xl font-bold text-foreground",
			children: "Gestion du Menu"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col sm:flex-row gap-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: () => setView("categories"),
				className: "group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-10 text-white transition-all duration-150 active:translate-y-1 overflow-hidden",
				style: {
					background: "linear-gradient(135deg, #6366f1, #4f46e5)",
					boxShadow: "0 8px 0 #3730a3, 0 12px 20px rgba(99,102,241,0.4)"
				},
				onMouseDown: (e) => {
					e.currentTarget.style.boxShadow = "0 4px 0 #3730a3, 0 6px 10px rgba(99,102,241,0.4)";
					e.currentTarget.style.transform = "translateY(4px)";
				},
				onMouseUp: (e) => {
					e.currentTarget.style.boxShadow = "0 8px 0 #3730a3, 0 12px 20px rgba(99,102,241,0.4)";
					e.currentTarget.style.transform = "translateY(0)";
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "absolute inset-0 opacity-10 pointer-events-none",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { className: "absolute top-4 left-4 h-8 w-8 -rotate-12" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, { className: "absolute bottom-6 right-6 h-10 w-10 rotate-12" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Box, { className: "absolute top-1/2 right-4 h-6 w-6 rotate-45" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Layers, { className: "absolute bottom-4 left-8 h-8 w-8 -rotate-6" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm relative z-10",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Layers, { className: "h-8 w-8 text-white" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xl font-bold tracking-wide relative z-10",
						children: "Gestion Catégorie"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm text-white/70 relative z-10",
						children: loading ? "…" : `${categories.length} catégories`
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: () => setView("products"),
				className: "group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-10 text-white transition-all duration-150 overflow-hidden",
				style: {
					background: "linear-gradient(135deg, #f59e0b, #d97706)",
					boxShadow: "0 8px 0 #92400e, 0 12px 20px rgba(245,158,11,0.4)"
				},
				onMouseDown: (e) => {
					e.currentTarget.style.boxShadow = "0 4px 0 #92400e, 0 6px 10px rgba(245,158,11,0.4)";
					e.currentTarget.style.transform = "translateY(4px)";
				},
				onMouseUp: (e) => {
					e.currentTarget.style.boxShadow = "0 8px 0 #92400e, 0 12px 20px rgba(245,158,11,0.4)";
					e.currentTarget.style.transform = "translateY(0)";
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "absolute inset-0 opacity-10 pointer-events-none",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Coffee, { className: "absolute top-4 right-4 h-8 w-8 rotate-12" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Utensils, { className: "absolute bottom-6 left-6 h-10 w-10 -rotate-12" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, { className: "absolute top-1/2 left-4 h-6 w-6 -rotate-45" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChefHat, { className: "absolute bottom-4 right-8 h-8 w-8 rotate-6" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm relative z-10",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, { className: "h-8 w-8 text-white" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xl font-bold tracking-wide relative z-10",
						children: "Gestion Produit"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm text-white/70 relative z-10",
						children: loading ? "…" : `${products.length} produits`
					})
				]
			})]
		})]
	});
	if (view === "categories") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col gap-6 p-6 overflow-y-auto",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => setView("home"),
					className: "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "h-4 w-4" }), " Retour"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-xl font-bold",
					children: "Gestion des Catégories"
				})]
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive",
				children: error
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: handleAddCategory,
				className: "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 max-w-sm",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-sm font-semibold",
						children: isEditingCat ? "Modifier la catégorie" : "Ajouter une catégorie"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "text",
						placeholder: "Nom de la catégorie...",
						value: newCatName,
						onChange: (e) => setNewCatName(e.target.value),
						className: "rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary",
						required: true
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-1.5 mt-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "text-sm font-medium",
							children: "Image (optionnel)"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImageUploader, {
							value: newCatImage,
							onChange: setNewCatImage
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-2 mt-1",
						children: [isEditingCat && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: handleCancelEditCat,
							className: "flex-1 rounded-md px-4 py-2 text-sm font-medium hover:bg-muted",
							children: "Annuler"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: saving,
							className: "flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
							children: saving ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : isEditingCat ? "Enregistrer" : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " Ajouter"] })
						})]
					})
				]
			}),
			loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2 text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), " Chargement…"]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4",
				children: categories.map((cat) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted",
						children: [cat.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: cat.image,
							alt: cat.name,
							className: "h-full w-full object-cover"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-full items-center justify-center text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { className: "h-6 w-6 opacity-20" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "absolute right-2 top-2 flex gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => handleEditCategoryClick(cat),
								className: "grid place-items-center rounded bg-background/90 p-1.5 text-foreground backdrop-blur-sm hover:bg-background",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pen, { className: "h-3.5 w-3.5" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => handleDeleteCategory(cat),
								className: "grid place-items-center rounded bg-destructive/90 p-1.5 text-destructive-foreground backdrop-blur-sm hover:bg-destructive",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
							})]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-1 pb-1",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-semibold text-sm",
							children: cat.name
						})
					})]
				}, cat.id ?? cat.name))
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col gap-0 overflow-hidden bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "w-full shrink-0 border-b border-border bg-card",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-4 overflow-x-auto p-4 no-scrollbar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setView("home"),
						className: "flex shrink-0 h-16 w-16 flex-col items-center justify-center gap-1 rounded-full border-2 border-border bg-muted text-muted-foreground hover:bg-muted/80 transition-colors",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "h-5 w-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] font-medium",
							children: "Retour"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-10 w-px bg-border shrink-0 mx-1" }),
					loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2 p-4 text-muted-foreground text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), " Chargement…"]
					}) : categories.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "p-4 text-xs text-muted-foreground",
						children: "Aucune catégorie. Créez-en une depuis \"Gestion Catégorie\"."
					}) : categories.map((cat) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setActiveCategory(cat.name),
						className: `group flex shrink-0 flex-col items-center gap-2 transition-all ${effectiveCategory === cat.name ? "opacity-100 scale-105" : "opacity-70 hover:opacity-100"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: `relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 transition-colors ${effectiveCategory === cat.name ? "border-primary shadow-md" : "border-border bg-muted group-hover:border-primary/50"}`,
							children: cat.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: cat.image,
								alt: cat.name,
								className: "h-full w-full object-cover"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-bold uppercase",
								children: cat.name.substring(0, 2)
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: `text-xs font-medium ${effectiveCategory === cat.name ? "text-primary font-bold" : "text-muted-foreground"}`,
							children: cat.name
						})]
					}, cat.id ?? cat.name))
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex-1 flex flex-col overflow-hidden",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between border-b border-border bg-card px-5 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-semibold",
						children: effectiveCategory || "—"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => {
							setIsEditing(null);
							setShowProductForm(true);
						},
						disabled: !effectiveCategory,
						className: "flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " Ajouter Produit"]
					})]
				}),
				error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mx-4 mt-3 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive",
					children: error
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex-1 overflow-y-auto p-4",
					children: showProductForm ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductForm, {
						initialData: isEditing,
						category: effectiveCategory,
						categories: categories.map((c) => c.name),
						onSave: async (prod) => {
							setSaving(true);
							setError(null);
							try {
								if (isEditing) await updateProduct(isEditing.id, prod);
								else {
									const { id: _id, ...rest } = prod;
									await addProduct(rest);
								}
								setShowProductForm(false);
								setIsEditing(null);
							} catch (err) {
								setError(err.message ?? "Erreur lors de la sauvegarde");
							} finally {
								setSaving(false);
							}
						},
						onCancel: () => {
							setShowProductForm(false);
							setIsEditing(null);
						},
						saving
					}) : loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2 text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), " Chargement…"]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4",
						children: [products.filter((p) => p.category === effectiveCategory).map((prod) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "group flex flex-col gap-3 rounded-xl border border-border p-3 bg-card",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative aspect-video w-full overflow-hidden rounded-lg bg-muted",
								children: [prod.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: prod.image,
									alt: prod.name,
									className: "h-full w-full object-cover"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex h-full items-center justify-center text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { className: "h-8 w-8 opacity-20" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "absolute right-2 top-2 flex gap-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => {
											setIsEditing(prod);
											setShowProductForm(true);
										},
										className: "grid place-items-center rounded bg-background/90 p-1.5 backdrop-blur-sm hover:bg-background",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pen, { className: "h-4 w-4" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => handleDeleteProduct(prod.id),
										className: "grid place-items-center rounded bg-destructive/90 p-1.5 text-destructive-foreground backdrop-blur-sm hover:bg-destructive",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
									})]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									className: "font-semibold",
									children: prod.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm font-bold text-primary",
									children: [prod.price, " DA"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-xs font-medium ${prod.available ? "text-green-600" : "text-destructive"}`,
									children: prod.available ? "Disponible" : "Indisponible"
								})
							] })]
						}, prod.id)), products.filter((p) => p.category === effectiveCategory).length === 0 && effectiveCategory && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "col-span-full text-sm text-muted-foreground",
							children: "Aucun produit dans cette catégorie."
						})]
					})
				})
			]
		})]
	});
}
function ProductForm({ initialData, category, categories, onSave, onCancel, saving }) {
	const [name, setName] = (0, import_react.useState)(initialData?.name || "");
	const [price, setPrice] = (0, import_react.useState)(initialData?.price?.toString() || "");
	const [image, setImage] = (0, import_react.useState)(initialData?.image || "");
	const [selectedCategory, setSelectedCategory] = (0, import_react.useState)(initialData?.category || category);
	const [available, setAvailable] = (0, import_react.useState)(initialData?.available ?? true);
	const [ingredients, setIngredients] = (0, import_react.useState)(initialData?.ingredients || "");
	const [options, setOptions] = (0, import_react.useState)(initialData?.options?.map((o) => ({
		label: o.label,
		price: o.price.toString()
	})) ?? []);
	const addOption = () => setOptions((prev) => [...prev, {
		label: "",
		price: ""
	}]);
	const removeOption = (i) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
	const updateOption = (i, field, value) => setOptions((prev) => prev.map((o, idx) => idx === i ? {
		...o,
		[field]: value
	} : o));
	const handleSubmit = (e) => {
		e.preventDefault();
		if (!name.trim() || !price) return;
		const parsedOptions = options.filter((o) => o.label.trim()).map((o) => ({
			label: o.label.trim(),
			price: parseInt(o.price) || 0
		}));
		onSave({
			id: initialData?.id || `p_${Date.now()}`,
			name: name.trim(),
			category: selectedCategory,
			price: parseInt(price),
			image,
			available,
			options: parsedOptions.length > 0 ? parsedOptions : void 0,
			ingredients: ingredients.trim() || void 0
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		onSubmit: handleSubmit,
		className: "flex flex-col gap-4 rounded-lg border border-border bg-background p-4 max-w-md",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
				className: "text-lg font-semibold",
				children: [initialData ? "Modifier" : "Nouveau", " Produit"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Nom du produit"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					autoFocus: true,
					required: true,
					type: "text",
					value: name,
					onChange: (e) => setName(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Catégorie"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					value: selectedCategory,
					onChange: (e) => setSelectedCategory(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary",
					children: categories.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: c,
						children: c
					}, c))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "text-sm font-medium",
					children: ["Prix de base (DA)", options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-2 text-xs font-normal text-muted-foreground",
						children: "(utilisé si aucune option sélectionnée)"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					required: true,
					type: "number",
					min: "0",
					value: price,
					onChange: (e) => setPrice(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "text-sm font-medium",
						children: ["Options ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs font-normal text-muted-foreground",
							children: "(taille, variante…) — optionnel"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: addOption,
						className: "flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-3 w-3" }), " Ajouter"]
					})]
				}), options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Label (ex: S, M, L)" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Prix (DA)" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
						]
					}), options.map((opt, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-[1fr_1fr_auto] gap-2 items-center",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "text",
								placeholder: "Ex: Large",
								value: opt.label,
								onChange: (e) => updateOption(i, "label", e.target.value),
								className: "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "number",
								min: "0",
								placeholder: "0",
								value: opt.price,
								onChange: (e) => updateOption(i, "price", e.target.value),
								className: "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => removeOption(i),
								className: "grid place-items-center rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
							})
						]
					}, i))]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "text-sm font-medium",
					children: ["Ingrédients ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs font-normal text-muted-foreground",
						children: "— optionnel"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					rows: 2,
					placeholder: "Ex: Tomate, Mozzarella, Basilic, Huile d'olive…",
					value: ingredients,
					onChange: (e) => setIngredients(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary resize-none"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					id: "available-toggle",
					type: "checkbox",
					checked: available,
					onChange: (e) => setAvailable(e.target.checked),
					className: "h-4 w-4 cursor-pointer accent-primary"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					htmlFor: "available-toggle",
					className: "text-sm font-medium cursor-pointer",
					children: "Disponible"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Image du produit"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImageUploader, {
					value: image,
					onChange: setImage
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex items-center justify-end gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onCancel,
					className: "rounded-md px-4 py-2 text-sm font-medium hover:bg-muted",
					children: "Annuler"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "submit",
					disabled: saving,
					className: "flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
					children: [saving && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), "Enregistrer"]
				})]
			})
		]
	});
}
function TableManager() {
	const { rooms, tables, loading, addRoom, deleteRoom, addTable, updateTable, deleteTable } = useTableStore();
	const [activeRoom, setActiveRoom] = (0, import_react.useState)("");
	const [newRoomName, setNewRoomName] = (0, import_react.useState)("");
	const [saving, setSaving] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const adminRooms = rooms.filter((r) => r.name.toLowerCase() !== "emporter");
	const effectiveActiveRoom = adminRooms.some((r) => r.id === activeRoom) ? activeRoom : adminRooms[0]?.id || "";
	const [isEditing, setIsEditing] = (0, import_react.useState)(null);
	const [showTableForm, setShowTableForm] = (0, import_react.useState)(false);
	const handleAddRoom = async (e) => {
		e.preventDefault();
		if (!newRoomName.trim()) return;
		setSaving(true);
		setError(null);
		try {
			await addRoom(newRoomName.trim());
			setNewRoomName("");
		} catch (err) {
			setError(err.message ?? "Erreur lors de l'ajout de la salle");
		} finally {
			setSaving(false);
		}
	};
	const handleDeleteRoom = async (id) => {
		setSaving(true);
		setError(null);
		try {
			await deleteRoom(id);
			if (activeRoom === id) setActiveRoom("");
		} catch (err) {
			setError(err.message ?? "Erreur lors de la suppression");
		} finally {
			setSaving(false);
		}
	};
	const handleDeleteTable = async (id) => {
		setSaving(true);
		setError(null);
		try {
			await deleteTable(id);
		} catch (err) {
			setError(err.message ?? "Erreur lors de la suppression");
		} finally {
			setSaving(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col gap-0 overflow-hidden bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full shrink-0 border-b border-border bg-card flex flex-col",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center justify-center gap-3 px-5 pt-6 pb-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-xl font-bold",
						children: "Salles"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleAddRoom,
						className: "flex shrink-0 items-center justify-center gap-2 w-full max-w-xs",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "text",
							required: true,
							placeholder: "Nouvelle salle...",
							value: newRoomName,
							onChange: (e) => setNewRoomName(e.target.value),
							className: "flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary shadow-sm"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: saving,
							className: "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60",
							children: saving ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" })
						})]
					}),
					error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-destructive",
						children: error
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-center gap-4 overflow-x-auto px-5 py-4 no-scrollbar",
				children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 text-muted-foreground text-sm py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), " Chargement…"]
				}) : adminRooms.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-4 text-xs text-muted-foreground py-2",
					children: "Aucune salle. Ajoutez-en une pour commencer."
				}) : adminRooms.map((room) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `group relative flex shrink-0 flex-col items-center gap-2 transition-all ${effectiveActiveRoom === room.id ? "opacity-100 scale-105" : "opacity-70 hover:opacity-100"}`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setActiveRoom(room.id),
							className: `relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 transition-colors ${effectiveActiveRoom === room.id ? "border-primary shadow-md" : "border-border bg-muted group-hover:border-primary/50"}`,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-bold uppercase",
								children: room.name.substring(0, 2)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: `text-xs font-medium ${effectiveActiveRoom === room.id ? "text-primary font-bold" : "text-muted-foreground"}`,
							children: room.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => handleDeleteRoom(room.id),
							className: "absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground transition-opacity",
							title: "Supprimer la salle",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" })
						})
					]
				}, room.id))
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex-1 flex flex-col overflow-hidden",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-center border-b border-border bg-card px-5 py-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						if (adminRooms.length === 0) {
							alert("Veuillez d'abord ajouter une salle avant d'ajouter une table.");
							return;
						}
						setIsEditing(null);
						setShowTableForm(true);
					},
					className: "flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4" }), " Ajouter Table"]
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex-1 overflow-y-auto p-5",
				children: showTableForm ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableForm, {
					initialData: isEditing,
					activeRoomId: effectiveActiveRoom,
					rooms: adminRooms,
					onSave: async (tbl) => {
						setSaving(true);
						setError(null);
						try {
							if (isEditing) await updateTable(isEditing.id, tbl);
							else {
								const { id: _id, ...rest } = tbl;
								await addTable(rest);
							}
							setShowTableForm(false);
							setIsEditing(null);
						} catch (err) {
							setError(err.message ?? "Erreur lors de la sauvegarde");
						} finally {
							setSaving(false);
						}
					},
					onCancel: () => {
						setShowTableForm(false);
						setIsEditing(null);
					},
					saving
				}) : loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), " Chargement…"]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 pb-4",
					children: [tables.filter((t) => t.roomId === effectiveActiveRoom).map((tbl) => {
						const roomName = rooms.find((r) => r.id === tbl.roomId)?.name || "Salle Inconnue";
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-background p-4 transition-colors hover:border-primary/50 aspect-square",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Grid3x3, { className: "h-8 w-8 text-muted-foreground" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "font-bold text-lg",
									children: ["T", tbl.number]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-col items-center gap-0.5 text-center",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-xs text-muted-foreground",
										children: [tbl.seats, " places"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1",
										children: roomName
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "absolute right-2 top-2 flex gap-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => {
											setIsEditing(tbl);
											setShowTableForm(true);
										},
										className: "grid place-items-center rounded-md bg-muted/50 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
										title: "Modifier",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pen, { className: "h-3.5 w-3.5" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => handleDeleteTable(tbl.id),
										className: "grid place-items-center rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors",
										title: "Supprimer",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3.5 w-3.5" })
									})]
								})
							]
						}, tbl.id);
					}), tables.filter((t) => t.roomId === effectiveActiveRoom).length === 0 && effectiveActiveRoom && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "col-span-full text-sm text-muted-foreground",
						children: "Aucune table dans cette salle."
					})]
				})
			})]
		})]
	});
}
function TableForm({ initialData, activeRoomId, rooms, onSave, onCancel, saving }) {
	const [number, setNumber] = (0, import_react.useState)(initialData?.number?.toString() || "");
	const [seats, setSeats] = (0, import_react.useState)(initialData?.seats?.toString() || "4");
	const defaultRoom = initialData?.roomId || activeRoomId || rooms[0]?.id || "";
	const [selectedRoom, setSelectedRoom] = (0, import_react.useState)(defaultRoom);
	const handleSubmit = (e) => {
		e.preventDefault();
		if (!number || !seats || !selectedRoom) return;
		onSave({
			id: initialData?.id || `t_${Date.now()}`,
			number: parseInt(number),
			seats: parseInt(seats),
			status: initialData?.status || "libre",
			roomId: selectedRoom
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		onSubmit: handleSubmit,
		className: "flex flex-col gap-4 rounded-lg bg-background p-4 border border-border max-w-md",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
				className: "text-lg font-semibold",
				children: [initialData ? "Modifier" : "Nouvelle", " Table"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Salle"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					value: selectedRoom,
					onChange: (e) => setSelectedRoom(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary",
					children: rooms.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: r.id,
						children: r.name
					}, r.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Numéro de la table"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					autoFocus: true,
					required: true,
					type: "number",
					value: number,
					onChange: (e) => setNumber(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "text-sm font-medium",
					children: "Nombre de places"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					required: true,
					type: "number",
					value: seats,
					onChange: (e) => setSeats(e.target.value),
					className: "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex items-center justify-end gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onCancel,
					className: "rounded-md px-4 py-2 text-sm font-medium hover:bg-muted",
					children: "Annuler"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "submit",
					disabled: saving,
					className: "flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
					children: [saving && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), "Enregistrer"]
				})]
			})
		]
	});
}
async function fetchDayStats(date) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const end = new Date(date);
	end.setHours(23, 59, 59, 999);
	const { data, error } = await supabase.from("orders").select("total, payment_method").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).eq("status", "paid");
	if (error) {
		console.error("Erreur chargement rapport Z:", error.message);
		return {
			totalOrders: 0,
			totalRevenue: 0,
			totalCash: 0,
			totalCard: 0
		};
	}
	const rows = data ?? [];
	const totalOrders = rows.length;
	const totalCash = rows.filter((r) => r["payment_method"] === "cash").reduce((acc, r) => acc + r["total"], 0);
	const totalCard = rows.filter((r) => r["payment_method"] === "card").reduce((acc, r) => acc + r["total"], 0);
	return {
		totalOrders,
		totalRevenue: totalCash + totalCard,
		totalCash,
		totalCard
	};
}
function ZReport() {
	const [date, setDate] = (0, import_react.useState)(/* @__PURE__ */ new Date());
	const [showCalendar, setShowCalendar] = (0, import_react.useState)(false);
	const [stats, setStats] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setLoading(true);
		fetchDayStats(date).then((s) => {
			setStats(s);
			setLoading(false);
		});
	}, [date]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col gap-6 p-6 overflow-y-auto",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col sm:flex-row sm:items-end justify-between gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-2xl font-bold",
				children: "Rapport Z"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "Statistiques des commandes encaissées"
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: () => setShowCalendar(!showCalendar),
					className: "flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Calendar, { className: "h-4 w-4" }), format(date, "EEEE d MMMM yyyy", { locale: fr })]
				}), showCalendar && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute right-0 top-12 z-50 rounded-lg border border-border bg-card p-3 shadow-xl",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DayPicker, {
						mode: "single",
						selected: date,
						onSelect: (d) => {
							if (d) setDate(d);
							setShowCalendar(false);
						},
						locale: fr
					})
				})]
			})]
		}), loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-1 items-center justify-center py-20",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-8 w-8 animate-spin text-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Chargement du rapport…"
				})]
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
					title: "Chiffre d'Affaires",
					value: `${(stats?.totalRevenue ?? 0).toLocaleString("fr-FR")} DA`,
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "h-5 w-5 text-primary" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
					title: "Commandes Encaissées",
					value: (stats?.totalOrders ?? 0).toString(),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receipt, { className: "h-5 w-5 text-blue-500" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
					title: "Paiements Espèces",
					value: `${(stats?.totalCash ?? 0).toLocaleString("fr-FR")} DA`,
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Banknote, { className: "h-5 w-5 text-green-500" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
					title: "Paiements Carte",
					value: `${(stats?.totalCard ?? 0).toLocaleString("fr-FR")} DA`,
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-5 w-5 text-orange-500" })
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex-1 rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center text-muted-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "h-12 w-12 opacity-20 mb-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: stats?.totalOrders === 0 ? "Aucune commande encaissée ce jour." : "Les graphiques détaillés seront disponibles prochainement." })]
		})] })]
	});
}
function StatCard({ title, value, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-sm font-medium text-muted-foreground",
				children: title
			}), icon]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-2xl font-bold",
			children: value
		})]
	});
}
function AdminLogin({ onSuccess }) {
	const [username, setUsername] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [showPassword, setShowPassword] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [isShaking, setIsShaking] = (0, import_react.useState)(false);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const inputRef = (0, import_react.useRef)(null);
	const setAdminAuthenticated = useAuthStore((s) => s.setAdminAuthenticated);
	(0, import_react.useEffect)(() => {
		inputRef.current?.focus();
	}, []);
	async function handleSubmit(e) {
		e.preventDefault();
		if (!username.trim() || !password.trim()) return;
		setIsLoading(true);
		setError("");
		const { data, error: dbError } = await supabase.from("pos_users").select("username, password").eq("id", ADMIN_ROW_ID).maybeSingle();
		if (dbError || !data) {
			setIsLoading(false);
			setError("Erreur de connexion au serveur. Réessayez.");
			setIsShaking(true);
			setPassword("");
			setTimeout(() => setIsShaking(false), 600);
			inputRef.current?.focus();
			return;
		}
		const usernameMatch = username.trim().toLowerCase() === data.username.toLowerCase();
		const passwordMatch = password.trim() === data.password;
		if (usernameMatch && passwordMatch) {
			setAdminAuthenticated(true);
			onSuccess();
		} else {
			const { useSessionStore } = await import("./menuStore-CFwYtg9E.mjs").then((n) => n.n).then((n) => n.r);
			const employeeResult = await useSessionStore.getState().loginUser(username, password);
			if (employeeResult.ok && !employeeResult.isAdmin) {
				window.location.href = "/tables";
				return;
			}
			setIsLoading(false);
			setError("Identifiants incorrects. Veuillez réessayer.");
			setIsShaking(true);
			setPassword("");
			setTimeout(() => setIsShaking(false), 600);
			inputRef.current?.focus();
		}
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
								children: "Panneau d'administration"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "admin-login-badge",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
							size: 14,
							className: "admin-login-badge-icon"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Accès restreint" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmit,
						className: "admin-login-form",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "admin-login-label",
								htmlFor: "admin-username",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { size: 13 }), "Nom d'utilisateur admin"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "admin-login-input-wrap",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "admin-username",
									type: "text",
									value: username,
									onChange: (e) => {
										setUsername(e.target.value);
										setError("");
									},
									placeholder: "ex: admin",
									className: "admin-login-input mb-3",
									autoComplete: "username"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "admin-login-label",
								htmlFor: "admin-password",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { size: 13 }), "Mot de passe administrateur"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-login-input-wrap",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "admin-password",
									ref: inputRef,
									type: showPassword ? "text" : "password",
									value: password,
									onChange: (e) => {
										setPassword(e.target.value);
										setError("");
									},
									placeholder: "••••••••",
									className: "admin-login-input",
									autoComplete: "current-password"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "admin-login-eye",
									onClick: () => setShowPassword((v) => !v),
									tabIndex: -1,
									"aria-label": showPassword ? "Masquer" : "Afficher",
									children: showPassword ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { size: 16 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 16 })
								})]
							}),
							error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-login-error",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: error })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "submit",
								className: "admin-login-btn",
								disabled: isLoading || !username.trim() || !password.trim(),
								children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "admin-login-spinner" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									style: { marginLeft: 8 },
									children: "Connexion…"
								})] }) : "Accéder au panneau"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "admin-login-footer",
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
var ROLE_LABELS = {
	caisse: "Caisse",
	serveur: "Serveur"
};
var ROLE_COLORS = {
	caisse: {
		badge: "bg-primary/10 text-primary border-primary/20",
		dot: "bg-primary"
	},
	serveur: {
		badge: "bg-violet-100 text-violet-700 border-violet-200",
		dot: "bg-violet-500"
	}
};
function UserManager() {
	const { users, loading, fetchUsers, addUser, deleteUser } = useUsersStore();
	const [username, setUsername] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [showPw, setShowPw] = (0, import_react.useState)(false);
	const [role, setRole] = (0, import_react.useState)("caisse");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const [formError, setFormError] = (0, import_react.useState)("");
	const [successMsg, setSuccessMsg] = (0, import_react.useState)("");
	const [deletingId, setDeletingId] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		fetchUsers();
	}, []);
	async function handleAdd(e) {
		e.preventDefault();
		setFormError("");
		setSuccessMsg("");
		setSubmitting(true);
		const result = await addUser(username, password, role);
		setSubmitting(false);
		if (!result.ok) setFormError(result.error ?? "Erreur inconnue.");
		else {
			setSuccessMsg(`Utilisateur « ${username.trim()} » créé.`);
			setUsername("");
			setPassword("");
		}
	}
	async function handleDelete(id, uname) {
		if (!confirm(`Supprimer l'utilisateur « ${uname} » ?`)) return;
		setDeletingId(id);
		await deleteUser(id);
		setDeletingId(null);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col overflow-y-auto p-4 md:p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-6 flex items-center gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-5 w-5 text-primary-foreground" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-lg font-bold",
				children: "Gestion des utilisateurs"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground",
				children: "Créez les comptes pour la caisse et les serveurs"
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-6 md:grid-cols-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4 h-fit",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 text-sm font-semibold",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserPlus, { className: "h-4 w-4 text-primary" }), "Ajouter un utilisateur"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleAdd,
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
								children: "Nom d'utilisateur"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "text",
								value: username,
								onChange: (e) => {
									setUsername(e.target.value);
									setFormError("");
									setSuccessMsg("");
								},
								placeholder: "ex: marie.caisse",
								className: "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20",
								required: true,
								autoComplete: "off"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
								children: "Mot de passe"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: showPw ? "text" : "password",
									value: password,
									onChange: (e) => {
										setPassword(e.target.value);
										setFormError("");
										setSuccessMsg("");
									},
									placeholder: "••••••••",
									className: "w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20",
									required: true,
									autoComplete: "new-password"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setShowPw((v) => !v),
									className: "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",
									tabIndex: -1,
									children: showPw ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "h-4 w-4" })
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
								children: "Rôle"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid grid-cols-2 gap-2",
								children: ["caisse", "serveur"].map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => setRole(r),
									className: `flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${role === r ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`,
									children: [r === "caisse" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CassetteTape, { className: "h-4 w-4" }), ROLE_LABELS[r]]
								}, r))
							})]
						}),
						formError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs font-medium text-destructive",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3.5 w-3.5 shrink-0" }), formError]
						}),
						successMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-xs font-medium text-success",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "h-3.5 w-3.5 shrink-0" }), successMsg]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "submit",
							disabled: submitting,
							className: "mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
							children: [submitting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserPlus, { className: "h-4 w-4" }), submitting ? "Création…" : "Créer l'utilisateur"]
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2 text-sm font-semibold",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-4 w-4 text-primary" }),
							"Utilisateurs (",
							users.length,
							")"
						]
					}), loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin text-muted-foreground" })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-2 max-h-[400px] overflow-y-auto",
					children: [!loading && users.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-10 w-10 opacity-20" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm",
							children: [
								"Aucun utilisateur pour l'instant.",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								"Créez le premier compte ci-contre."
							]
						})]
					}), users.map((user) => {
						const colors = ROLE_COLORS[user.role];
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition hover:bg-muted/40",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground",
									children: user.username.substring(0, 2)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate text-sm font-semibold",
										children: user.username
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${colors.badge}`,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-1.5 w-1.5 rounded-full ${colors.dot}` }), ROLE_LABELS[user.role]]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => handleDelete(user.id, user.username),
									disabled: deletingId === user.id,
									className: "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-40",
									title: "Supprimer",
									children: deletingId === user.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
								})
							]
						}, user.id);
					})]
				})]
			})]
		})]
	});
}
function AdminProfile() {
	const [adminUsername, setAdminUsername] = (0, import_react.useState)("");
	const [newUsername, setNewUsername] = (0, import_react.useState)("");
	const [usernameLoaded, setUsernameLoaded] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		supabase.from("pos_users").select("username").eq("id", ADMIN_ROW_ID).maybeSingle().then(({ data }) => {
			if (data?.username) {
				setAdminUsername(data.username);
				setNewUsername(data.username);
			}
			setUsernameLoaded(true);
		});
	}, []);
	const [usernameMsg, setUsernameMsg] = (0, import_react.useState)(null);
	const [isSavingUsername, setIsSavingUsername] = (0, import_react.useState)(false);
	const [currentPwd, setCurrentPwd] = (0, import_react.useState)("");
	const [newPwd, setNewPwd] = (0, import_react.useState)("");
	const [confirmPwd, setConfirmPwd] = (0, import_react.useState)("");
	const [showCur, setShowCur] = (0, import_react.useState)(false);
	const [showNew, setShowNew] = (0, import_react.useState)(false);
	const [showCon, setShowCon] = (0, import_react.useState)(false);
	const [passwordMsg, setPasswordMsg] = (0, import_react.useState)(null);
	const [isSavingPassword, setIsSavingPassword] = (0, import_react.useState)(false);
	async function handleSaveUsername(e) {
		e.preventDefault();
		const trimmed = newUsername.trim();
		if (!trimmed) {
			setUsernameMsg({
				type: "err",
				text: "Le nom d'utilisateur ne peut pas être vide."
			});
			return;
		}
		setIsSavingUsername(true);
		try {
			const finalResult = await updateAdminCredentials({ username: trimmed });
			if (!finalResult.ok) setUsernameMsg({
				type: "err",
				text: finalResult.error ?? "Erreur lors de la sauvegarde."
			});
			else {
				setAdminUsername(trimmed);
				setUsernameMsg({
					type: "ok",
					text: "Nom d'utilisateur mis à jour avec succès."
				});
				setTimeout(() => setUsernameMsg(null), 3500);
			}
		} catch {
			setUsernameMsg({
				type: "err",
				text: "Erreur réseau. Réessayez."
			});
		} finally {
			setIsSavingUsername(false);
		}
	}
	async function handleSavePassword(e) {
		e.preventDefault();
		if (!await verifyAdminPassword(currentPwd)) {
			setPasswordMsg({
				type: "err",
				text: "Le mot de passe actuel est incorrect."
			});
			return;
		}
		if (newPwd.length < 6) {
			setPasswordMsg({
				type: "err",
				text: "Le nouveau mot de passe doit contenir au moins 6 caractères."
			});
			return;
		}
		if (newPwd !== confirmPwd) {
			setPasswordMsg({
				type: "err",
				text: "Les mots de passe ne correspondent pas."
			});
			return;
		}
		setIsSavingPassword(true);
		try {
			const result = await updateAdminCredentials({ password: newPwd });
			if (!result.ok) setPasswordMsg({
				type: "err",
				text: result.error ?? "Erreur lors de la sauvegarde."
			});
			else {
				setCurrentPwd("");
				setNewPwd("");
				setConfirmPwd("");
				setPasswordMsg({
					type: "ok",
					text: "Mot de passe mis à jour avec succès. Il est maintenant actif sur tous les appareils."
				});
				setTimeout(() => setPasswordMsg(null), 4e3);
			}
		} catch {
			setPasswordMsg({
				type: "err",
				text: "Erreur réseau. Réessayez."
			});
		} finally {
			setIsSavingPassword(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "admin-profile-root",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "admin-profile-header",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "admin-profile-avatar",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "admin-profile-avatar-icon" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "admin-profile-name",
				children: usernameLoaded ? adminUsername : "…"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "admin-profile-role",
				children: "Administrateur"
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "admin-profile-cards",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "admin-profile-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "admin-profile-card-title",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(User, { size: 18 }), "Changer le nom d'utilisateur"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSaveUsername,
					className: "admin-profile-form",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "admin-profile-field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "profile-username",
								children: "Nouveau nom d'utilisateur"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-profile-input-wrap",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(User, {
									size: 15,
									className: "admin-profile-input-icon"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "profile-username",
									type: "text",
									value: newUsername,
									onChange: (e) => {
										setNewUsername(e.target.value);
										setUsernameMsg(null);
									},
									placeholder: "ex: admin",
									autoComplete: "off",
									disabled: !usernameLoaded
								})]
							})]
						}),
						usernameMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: `admin-profile-msg ${usernameMsg.type === "ok" ? "admin-profile-msg-ok" : "admin-profile-msg-err"}`,
							children: [usernameMsg.type === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { size: 14 }), usernameMsg.text]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "admin-profile-btn",
							disabled: isSavingUsername || !usernameLoaded,
							children: isSavingUsername ? "Enregistrement…" : "Enregistrer le nom"
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "admin-profile-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "admin-profile-card-title",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, { size: 18 }), "Changer le mot de passe"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSavePassword,
					className: "admin-profile-form",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "admin-profile-field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "profile-current-pwd",
								children: "Mot de passe actuel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-profile-input-wrap",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
										size: 15,
										className: "admin-profile-input-icon"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "profile-current-pwd",
										type: showCur ? "text" : "password",
										value: currentPwd,
										onChange: (e) => {
											setCurrentPwd(e.target.value);
											setPasswordMsg(null);
										},
										placeholder: "••••••••",
										autoComplete: "current-password"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "admin-profile-eye",
										onClick: () => setShowCur((v) => !v),
										children: showCur ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 })
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "admin-profile-field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "profile-new-pwd",
								children: "Nouveau mot de passe"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-profile-input-wrap",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
										size: 15,
										className: "admin-profile-input-icon"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "profile-new-pwd",
										type: showNew ? "text" : "password",
										value: newPwd,
										onChange: (e) => {
											setNewPwd(e.target.value);
											setPasswordMsg(null);
										},
										placeholder: "min. 6 caractères",
										autoComplete: "new-password"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "admin-profile-eye",
										onClick: () => setShowNew((v) => !v),
										children: showNew ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 })
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "admin-profile-field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								htmlFor: "profile-confirm-pwd",
								children: "Confirmer le nouveau mot de passe"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "admin-profile-input-wrap",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lock, {
										size: 15,
										className: "admin-profile-input-icon"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										id: "profile-confirm-pwd",
										type: showCon ? "text" : "password",
										value: confirmPwd,
										onChange: (e) => {
											setConfirmPwd(e.target.value);
											setPasswordMsg(null);
										},
										placeholder: "••••••••",
										autoComplete: "new-password"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "admin-profile-eye",
										onClick: () => setShowCon((v) => !v),
										children: showCon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 })
									})
								]
							})]
						}),
						passwordMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: `admin-profile-msg ${passwordMsg.type === "ok" ? "admin-profile-msg-ok" : "admin-profile-msg-err"}`,
							children: [passwordMsg.type === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { size: 14 }), passwordMsg.text]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "admin-profile-btn",
							disabled: !currentPwd || !newPwd || !confirmPwd || isSavingPassword,
							children: isSavingPassword ? "Enregistrement…" : "Enregistrer le mot de passe"
						})
					]
				})]
			})]
		})]
	});
}
var navItems = [
	{
		id: "menu",
		icon: Utensils,
		label: "Gestion du Menu"
	},
	{
		id: "tables",
		icon: Armchair,
		label: "Gestion des Tables"
	},
	{
		id: "rapport",
		icon: ChartColumn,
		label: "Rapport Z"
	},
	{
		id: "utilisateurs",
		icon: Users,
		label: "Utilisateurs"
	},
	{
		id: "profil",
		icon: CircleUser,
		label: "Mon Profil"
	}
];
function AdminPage() {
	const [activeTab, setActiveTab] = (0, import_react.useState)("menu");
	const [isOpen, setIsOpen] = (0, import_react.useState)(true);
	const isAuthenticated = useAuthStore((s) => s.isAdminAuthenticated);
	const logout = useAuthStore((s) => s.logout);
	if (!isAuthenticated) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdminLogin, { onSuccess: () => {} });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-screen w-full overflow-hidden bg-background font-sans",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: `flex-col bg-sidebar text-sidebar-foreground border-r border-border transition-all duration-300 ${isOpen ? "flex w-60" : "hidden"}`,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChefHat, { className: "h-5 w-5 text-primary-foreground" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-extrabold uppercase tracking-tight",
						children: "Admin CPanel"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "mt-4 flex flex-1 flex-col gap-1 px-3",
					children: navItems.map(({ id, icon: Icon, label }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setActiveTab(id),
						className: `flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${activeTab === id ? "bg-primary text-primary-foreground shadow" : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-5 w-5 shrink-0" }), label]
					}, id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-t border-sidebar-border p-3 flex flex-col gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setIsOpen(false),
						className: "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Fermer le panneau" })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: logout,
						className: "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-destructive/80 transition-colors hover:bg-destructive/20 hover:text-destructive",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-5 w-5 shrink-0 opacity-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "-ml-8",
							children: "Déconnexion"
						})]
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "flex min-w-0 flex-1 flex-col overflow-hidden",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-5",
				children: [!isOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => setIsOpen(true),
					className: "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
					"aria-label": "Ouvrir le panneau",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Menu, { className: "h-5 w-5" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
					className: "text-lg font-semibold",
					children: [
						activeTab === "menu" && "Gestion du Menu",
						activeTab === "tables" && "Gestion des Tables",
						activeTab === "rapport" && "Rapport Z",
						activeTab === "utilisateurs" && "Gestion des Utilisateurs",
						activeTab === "profil" && "Mon Profil"
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex-1 overflow-hidden",
				children: [
					activeTab === "menu" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuManager, {}),
					activeTab === "tables" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableManager, {}),
					activeTab === "rapport" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZReport, {}),
					activeTab === "utilisateurs" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserManager, {}),
					activeTab === "profil" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdminProfile, {})
				]
			})]
		})]
	});
}
//#endregion
export { AdminPage as component };
