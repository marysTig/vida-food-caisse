import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X, CheckCircle2, CreditCard, NotebookPen, ChevronsUpDown, Check, ChevronDown } from "lucide-react";
import { CategoryTabs } from "./CategoryTabs";
import { ProductGrid } from "./ProductGrid";
import { ProductSearch } from "./ProductSearch";
import { ModifierModal } from "./ModifierModal";
import { SupplementModal } from "./SupplementModal";
import { CheckoutReceiptModal } from "./CheckoutReceiptModal";
import { OptionSelectModal } from "./OptionSelectModal";
import { type Category, type Product, type ProductOption, formatDA } from "@/data/menu";
import { useMenuStore } from "@/lib/menuStore";
import { type CartItem, cartSubtotal, lineTotal } from "@/lib/cart";
import { useTableGlobalState, updateTableRecord } from "@/lib/tableStore";
import { useTableOrdersStore } from "@/lib/tableOrdersStore";
import { useSessionStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";
import { usePrinterStore } from "@/lib/printerStore";
import { enqueueKitchenPrint } from "@/lib/kitchenPrintQueue";
import { runCashierReceiptPrint } from "@/lib/cashierPrint";
import { wakePrintQueueDaemon } from "@/lib/printQueueDaemon";
import { toast } from "sonner";
import { ComponentLoader } from "@/components/ui/PageLoader";
import { recordZReport } from "@/lib/zReport";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGlobalSupplementsStore, reloadGlobalSupplements, type GlobalSupplement } from "@/lib/globalSupplementsStore";
import { playAddSound, playCashSound } from "@/lib/posSounds";

// Stable references: a selector returning a fresh `[]` each time would make
// zustand re-render the panel on every store change.
const EMPTY_ITEMS: CartItem[] = [];
const EMPTY_SUPPLEMENTS: GlobalSupplement[] = [];

type TableOrderSidebarProps = {
  tableId: string;
  tableNumber: number;
  mergedIds?: string[] | undefined;
  onClose: () => void;
};

// ── OrderNoteInput ─────────────────────────────────────────────────────────────
type OrderNoteInputProps = {
  value: string;
  onChange: (note: string) => void;
};

function OrderNoteInput({ value, onChange }: OrderNoteInputProps) {
  const [localNote, setLocalNote] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setLocalNote(value);
  }, [value]);

  useEffect(() => {
    if (localNote !== value) {
      const timer = setTimeout(() => {
        onChangeRef.current(localNote);
      }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [localNote, value]);

  const handleBlur = () => {
    if (localNote !== value) {
      onChangeRef.current(localNote);
    }
  };

  return (
    <textarea
      value={localNote}
      onChange={(e) => setLocalNote(e.target.value)}
      onBlur={handleBlur}
      placeholder="Allergie, instructions spéciales…"
      rows={2}
      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary transition-colors"
    />
  );
}

// ── CartItemsMobile ────────────────────────────────────────────────────────────
// Défini HORS du composant parent pour éviter le remount à chaque render
type CartItemsMobileProps = {
  items: CartItem[];
  decrease: (id: string) => void;
  increase: (id: string) => void;
  remove: (id: string) => void;
  onAddSupplement?: (item: CartItem) => void;
};

function CartItemsMobile({ items, decrease, increase, remove, onAddSupplement }: CartItemsMobileProps) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-border bg-background p-2.5"
        >
          {/* Top row: info + qty + delete */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {item.product.name}
                {item.selectedOption && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({item.selectedOption.label})
                  </span>
                )}
              </p>
              {item.note && (
                <p className="truncate text-[10px] italic text-muted-foreground">"{item.note}"</p>
              )}
              {item.supplements.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {item.supplements.map(s => (
                    <span key={s.id} className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-semibold text-primary">
                      +{s.label}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] font-bold text-primary">{formatDA(lineTotal(item))}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => decrease(item.id)}
                className="grid h-6 w-6 place-items-center rounded-md border border-border text-foreground"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center text-xs font-bold text-foreground">{item.quantity}</span>
              <button
                type="button"
                onClick={() => increase(item.id)}
                className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Supplement button — own full-width row */}
          {onAddSupplement && (
            <button
              type="button"
              onClick={() => onAddSupplement(item)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/5 py-1.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 active:bg-primary/20"
            >
              <Plus className="h-2.5 w-2.5 shrink-0" />
              + Supplément
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── OrderListDesktop ──────────────────────────────────────────────────────────
// Défini HORS du composant parent pour éviter le remount à chaque render
type OrderListDesktopProps = {
  tableNumber: number;
  mergedNumbers: string | null;
  items: CartItem[];
  orderNote: string;
  itemCount: number;
  total: number;
  isOccupied: boolean;
  isServeur: boolean;
  decrease: (id: string) => void;
  increase: (id: string) => void;
  remove: (id: string) => void;
  onNoteChange: (note: string) => void;
  onValidate: () => void;
  onCheckout: () => void;
  validating: boolean;
  onReprintKitchen?: () => void;
  onAddSupplement?: (item: CartItem) => void;
};

function OrderListDesktop({
  tableNumber, mergedNumbers, items, orderNote, itemCount, total,
  isOccupied, isServeur, decrease, increase, remove, onNoteChange, onValidate, onCheckout, validating, onReprintKitchen, onAddSupplement
}: OrderListDesktopProps) {

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <p className="text-base font-bold text-foreground">Commande</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Table {tableNumber}</p>
            {mergedNumbers && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-200">
                + {mergedNumbers}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <ShoppingCart className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Aucun produit</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sélectionnez des produits pour démarrer.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                {/* Top row: info + qty controls + delete */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.product.name}
                      {item.selectedOption && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({item.selectedOption.label})
                        </span>
                      )}
                    </p>
                    {item.note && (
                      <p className="truncate text-xs italic text-muted-foreground">"{item.note}"</p>
                    )}
                    {item.supplements.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {item.supplements.map(s => (
                          <span key={s.id} className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-semibold text-primary">
                            +{s.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs font-bold text-primary">{formatDA(lineTotal(item))}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => decrease(item.id)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-foreground">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => increase(item.id)}
                      className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* Supplement button — own full-width row */}
                {onAddSupplement && (
                  <button
                    type="button"
                    onClick={() => onAddSupplement(item)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 active:bg-primary/20"
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    + Supplément
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-card p-4 space-y-3 overflow-y-auto max-h-[55vh]">
        {/* Note globale de commande */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <NotebookPen className="h-3.5 w-3.5" />
            Note de commande
          </label>
          <OrderNoteInput value={orderNote} onChange={onNoteChange} />

        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            {itemCount} article{itemCount > 1 ? "s" : ""}
          </span>
          <span className="text-lg font-extrabold text-foreground">{formatDA(total)}</span>
        </div>
        {isOccupied ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={onValidate}
                disabled={items.length === 0 || validating}
                className="flex-1 rounded-xl bg-secondary py-3.5 text-sm font-bold text-secondary-foreground shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? "Envoi…" : "Mettre à jour"}
              </button>
              {!isServeur && (
                <button
                  onClick={onCheckout}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-bold text-success-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  <CreditCard className="h-4 w-4" />
                  Encaisser
                </button>
              )}
            </div>
            {onReprintKitchen && (
              <button
                type="button"
                onClick={onReprintKitchen}
                disabled={items.length === 0}
                className="w-full rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Réimprimer cuisine
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={onValidate}
            disabled={items.length === 0 || validating}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {validating ? "Envoi en cours…" : "Valider la commande"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── ProductSelectorDesktop ─────────────────────────────────────────────────────
// Défini HORS du composant parent pour éviter le remount à chaque render
// C'est ici que se trouve la barre de recherche — crucial de le stabiliser
type ProductSelectorDesktopProps = {
  tableNumber: number;
  mergedNumbers: string | null;
  query: string;
  category: Category;
  allCategoryNames: string[];
  visibleProducts: Product[];
  loading: boolean;
  onClose: () => void;
  onQueryChange: (q: string) => void;
  onCategoryChange: (c: Category) => void;
  onProductSelect: (p: Product) => void;
};

function ProductSelectorDesktop({
  tableNumber, mergedNumbers, query, category, allCategoryNames,
  visibleProducts, loading, onClose, onQueryChange, onCategoryChange, onProductSelect,
}: ProductSelectorDesktopProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Table {tableNumber}</h2>
            {mergedNumbers && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                Fusionnée avec: {mergedNumbers}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Sélection des produits</p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-muted">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </header>
      <div className="border-b border-border px-4 py-3">
        <CategoryTabs active={category} onChange={onCategoryChange} categories={allCategoryNames} />
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <ProductSearch value={query} onChange={onQueryChange} />
        </div>
        {loading ? (
          <ComponentLoader />
        ) : visibleProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm font-semibold text-foreground">Aucun produit</p>
          </div>
        ) : (
          <ProductGrid products={visibleProducts} onSelect={onProductSelect} />
        )}
      </main>
    </div>
  );
}

// ── TableOrderSidebar ─────────────────────────────────────────────────────────

export function TableOrderSidebar({ tableId, tableNumber, mergedIds, onClose }: TableOrderSidebarProps) {
  // Narrow subscriptions: the panel re-renders only when ITS table / cart changes,
  // not on every update of every table or order from any device.
  const table = useTableGlobalState((s) => s.tables.find((t) => t.id === tableId));
  const rooms = useTableGlobalState((s) => s.rooms);
  const updateTable = updateTableRecord;
  const isOccupied = table?.status === "occupee";
  const currentUser = useSessionStore((s) => s.currentUser);
  const isServeur = currentUser?.role === "serveur";

  // Detecter si c'est une commande A Emporter
  const emporterRoom = rooms.find(r => r.name.toLowerCase() === "emporter");
  const isEmporter = emporterRoom ? table?.roomId === emporterRoom.id : false;
  // Label utilise pour l'impression cuisine
  const kitchenOrderLabel: string | number = isEmporter
    ? `EMPORTER #${tableNumber}`
    : tableNumber;

  const mergedNumbers = useTableGlobalState((s) =>
    mergedIds && mergedIds.length > 0
      ? mergedIds.map((id) => s.tables.find((t) => t.id === id)?.number).filter(Boolean).join(", ")
      : null,
  );

  // Actions are created once by zustand (stable) — no subscription needed for them.
  const { setOrder, setOrderNote, flushOrder, clearOrder, _patchOrder, _patchNote, _patchSupplements } =
    useTableOrdersStore.getState();
  const { supplements: allGlobalSupplements } = useGlobalSupplementsStore();

  const [category, setCategory] = useState<Category>("Tous");
  const [query, setQuery] = useState("");

  const items = useTableOrdersStore((s) => s.orders[tableId]) ?? EMPTY_ITEMS;
  const orderNote = useTableOrdersStore((s) => s.orderNotes[tableId]) ?? "";
  const activeSupplements = useTableOrdersStore((s) => s.orderSupplements[tableId]) ?? EMPTY_SUPPLEMENTS;
  const total = cartSubtotal(items);

  const [editing, setEditing] = useState<CartItem | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [activeSupplementItem, setActiveSupplementItem] = useState<CartItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // One validation / checkout at a time: a second tap while the first is still
  // saving (the button used to flip to "Mettre à jour" mid-save) ran a parallel copy.
  const [validating, setValidating] = useState(false);
  const validatingRef = useRef(false);
  const checkingOutRef = useRef(false);

  // When the Cashier opens the checkout modal for a server-created order, items may
  // not yet be in Zustand (async fetch still running). Re-fetch from Supabase to ensure
  // the modal has the correct items before the user confirms.
  useEffect(() => {
    if (!checkoutOpen || !isOccupied || isServeur) return;
    let mounted = true;
    const fetchIfEmpty = async () => {
      // Only re-fetch if Zustand doesn't have items yet
      const currentItems = useTableOrdersStore.getState().orders[tableId];
      if (currentItems && currentItems.length > 0) return;
      try {
        const { data, error } = await supabase
          .from("table_orders")
          .select("items, note, global_supplements")
          .eq("table_id", tableId)
          .maybeSingle();
        if (error || !data) return;
        if (mounted && data.items && (data.items as CartItem[]).length > 0) {
          _patchOrder(tableId, data.items as CartItem[]);
          _patchNote(tableId, data.note || "");
          _patchSupplements(tableId, ((data as any).global_supplements as GlobalSupplement[]) || []);
        }
      } catch (err) {
        console.error("[CHECKOUT OPEN] Fetch items failed:", err);
      }
    };
    void fetchIfEmpty();
    return () => { mounted = false; };
  }, [checkoutOpen, tableId, isOccupied, isServeur, _patchOrder, _patchNote, _patchSupplements]);

  // Mobile: panier ouvert ou fermé (bottom panel)
  // If the table is already occupied, we might want to open the cart by default to see the order
  const [cartOpen, setCartOpen] = useState(isOccupied);

  const { products, allCategoryNames, loading } = useMenuStore();
  const { printers } = usePrinterStore();

  // Garantir que les suppléments globaux sont chargés quand la sidebar s'ouvre
  // Realtime (useGlobalSupplementsSync) keeps them current — only fetch if the
  // list is still empty, instead of re-downloading on every panel open.
  useEffect(() => {
    if (useGlobalSupplementsStore.getState().supplements.length === 0) {
      void reloadGlobalSupplements();
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Seulement si la table est censée être occupée et que c'est la caisse qui ouvre
    if (isOccupied && !isServeur) {
      // Différer le fetch de 16ms pour laisser le premier rendu s'afficher
      const fetchOrderData = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          if (!mounted) return;
          try {
            const { data, error } = await supabase
              .from("table_orders")
              .select("items, note, global_supplements")
              .eq("table_id", tableId)
              .maybeSingle();
            
            if (error) {
              console.error("[CASHIER ORDER] Erreur SELECT table_orders:", error);
              break; // Arrêter les retries si erreur réseau/SQL grave
            }

            if (data && data.items && (data.items as CartItem[]).length > 0) {
              console.log("[CASHIER ORDER] Données récupérées avec succès:", data.items);
              if (mounted) {
                _patchOrder(tableId, data.items as CartItem[]);
                _patchNote(tableId, data.note || "");
                // Pour compatibilité avec les anciennes données qui n'ont peut-être pas la colonne:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                _patchSupplements(tableId, ((data as any).global_supplements as GlobalSupplement[]) || []);
              }
              break; // Succès, on arrête les retries
            } else if (i < retries - 1) {
              // Si pas de données mais que la table est "occupee", on attend un peu
              // pour pallier au timing (flushOrder du Serveur peut être en cours)
              console.log(`[CASHIER ORDER] Aucun item trouvé, retry ${i + 1}/${retries}...`);
              await new Promise(r => setTimeout(r, 800));
            }
          } catch (err) {
            console.error("[CASHIER ORDER] Exception SELECT:", err);
            break;
          }
        }
      };

      void fetchOrderData();
    }

    return () => {
      mounted = false;
    };
  }, [tableId, isOccupied, isServeur, _patchOrder, _patchNote, _patchSupplements]);



  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "Tous" || product.category === category;
      const matchesTerm =
        term.length === 0 ||
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [category, query, products]);

  const addProduct = useCallback((product: Product, selectedOption?: ProductOption) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    const existing = prev.find(
      (item) =>
        item.product.id === product.id &&
        item.supplements.length === 0 &&
        !item.note &&
        item.selectedOption?.label === selectedOption?.label,
    );
    if (existing) {
      setOrder(tableId, prev.map((item) =>
        item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item,
      ));
    } else {
      setOrder(tableId, [
        ...prev,
        {
          id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          product,
          quantity: 1,
          supplements: [],
          selectedOption,
        },
      ]);
    }
    playAddSound();
  }, [tableId, setOrder]);

  const handleProductSelect = useCallback((product: Product) => {
    if (product.options && product.options.length > 0) {
      setOptionProduct(product);
    } else {
      addProduct(product);
    }
  }, [addProduct]);

  const increase = useCallback((id: string) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    setOrder(tableId, prev.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item)));
  }, [tableId, setOrder]);

  const decrease = useCallback((id: string) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    setOrder(tableId, prev.flatMap((item) =>
      item.id === id
        ? item.quantity > 1
          ? [{ ...item, quantity: item.quantity - 1 }]
          : []
        : [item],
    ));
  }, [tableId, setOrder]);

  const remove = useCallback((id: string) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    setOrder(tableId, prev.filter((item) => item.id !== id));
  }, [tableId, setOrder]);

  const confirmModifier = (
    id: string,
    supplements: { id: string; label: string; price: number }[],
    note: string,
    customPrice?: number,
  ) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    setOrder(tableId, prev.map((item) =>
      item.id === id
        ? { ...item, supplements, note: note.trim() || undefined, customPrice }
        : item,
    ));
    setModifierOpen(false);
  };

  const handleValidateOrder = async () => {
    if (validatingRef.current) return;
    const initial = useTableOrdersStore.getState().orders[tableId] ?? [];
    if (initial.length === 0) return;

    validatingRef.current = true;
    setValidating(true);
    try {
      // 1. The cart must be in Supabase BEFORE the table shows "occupée", so the
      //    Caisse never opens a table whose items are not there yet.
      const saved = await flushOrder(tableId);
      if (!saved) {
        toast.error("Commande non enregistrée", {
          description: "Vérifiez la connexion puis réessayez.",
        });
        return;
      }

      // Latest cart / note / supplements (edits made while saving are included).
      const live = useTableOrdersStore.getState();
      const orderItems = live.orders[tableId] ?? initial;
      const liveNote = live.orderNotes[tableId] ?? "";
      const liveSupplements = live.orderSupplements[tableId] ?? [];
      const orderTotal = cartSubtotal(orderItems);
      const now = new Date().toISOString();
      const knownTables = useTableGlobalState.getState().tables;

      // 2. Table status and kitchen ticket are independent — run them together
      //    instead of one after the other (was 4–6 sequential round trips).
      const tableWork = Promise.all([
        updateTable(tableId, {
          status: "occupee",
          orderTotal,
          ...(isOccupied ? {} : { occupiedSince: now }),
        }),
        ...(mergedIds ?? [])
          .filter((mId) => knownTables.find((t) => t.id === mId)?.status !== "occupee")
          .map((mId) => updateTable(mId, { status: "occupee", occupiedSince: now })),
      ]);

      // FILE D'ATTENTE CUISINE (delta, idempotent, hub primaire)
      const kitchenWork = enqueueKitchenPrint({
        tableId,
        orderLabel: kitchenOrderLabel,
        items: orderItems.map((i) => ({ ...i })),
        orderNote: liveNote,
        globalSupplements: liveSupplements,
        printers,
      });

      const [tableResult, kitchenResult] = await Promise.allSettled([tableWork, kitchenWork]);

      if (kitchenResult.status === "fulfilled") {
        const result = kitchenResult.value;
        if (result.status === "blocked_unmapped") {
          toast.error("Catégories non associées à une imprimante cuisine", {
            description: result.unmappedNames.join(", "),
            duration: 8000,
          });
        } else if (result.status === "error") {
          toast.error("Impossible d'envoyer en cuisine", { description: result.message });
        } else if (result.status === "enqueued") {
          toast.success(isOccupied ? "Mise à jour envoyée en cuisine" : "Commande envoyée en cuisine");
          wakePrintQueueDaemon();
        }
      } else {
        console.error("Impossible de lancer l'impression cuisine", kitchenResult.reason);
        toast.error("Erreur lors de l'envoi cuisine");
      }

      if (tableResult.status === "rejected") {
        // Stay open: validating again is safe (kitchen lines already queued are skipped).
        console.error("[VALIDATE] mise à jour table échouée", tableResult.reason);
        toast.error("Table non mise à jour", {
          description: "Vérifiez la connexion puis appuyez à nouveau sur Valider.",
        });
        return;
      }

      onClose();
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
  };

  const handleCheckout = async () => {
    if (checkingOutRef.current) return;
    checkingOutRef.current = true;
    try {
      // --- SAUVEGARDE DES DONNEES POUR IMPRESSION (état le plus récent) ---
      const live = useTableOrdersStore.getState();
      const itemsToPrint = [...(live.orders[tableId] ?? [])];
      const supplementsToPrint = live.orderSupplements[tableId] ?? [];
      const totalToPrint = cartSubtotal(itemsToPrint);
      // ----------------------------------------------

      // Déterminer le type de commande et le label correct
      const orderType = isEmporter ? "emporter" : "table";
      const orderOrTableNumber = isEmporter ? tableNumber : tableNumber;
      const receiptLabel: string | number = isEmporter
        ? `À EMPORTER — Commande #${tableNumber}`
        : tableNumber;

      // Enregistrer dans l'historique du Rapport Z (AVANT de vider l'ordre)
      // Si le Z Report échoue, on arrête ici — on ne libère pas la table
      // pour éviter de perdre une vente sans l'avoir enregistrée.
      try {
        await recordZReport(itemsToPrint, orderType, orderOrTableNumber, []);
      } catch (err) {
        console.error("[CHECKOUT] Z Report a échoué — paiement annulé:", err);
        toast.error("Erreur d'enregistrement du Rapport Z. Paiement non finalisé.", { duration: 7000 });
        return; // Aborting — table stays occupied
      }

      playCashSound();

      // 1. Clear items + note
      clearOrder(tableId);
      // 2. Update DB to free the table (+ merged children in parallel)
      const children = isEmporter
        ? []
        : useTableGlobalState.getState().tables.filter((t) => t.parentTableId === tableId);
      await Promise.all([
        updateTable(tableId, {
          status: "libre",
          orderTotal: 0,
          occupiedSince: null as any,
          parentTableId: null,
        }),
        ...children.map((child) =>
          updateTable(child.id, {
            status: "libre",
            occupiedSince: null as any,
            orderTotal: 0,
            parentTableId: null,
          }),
        ),
      ]);

      // --- IMPRESSION CAISSE (file d'attente — pas d'attente Bluetooth) ---
      await runCashierReceiptPrint({
        printers,
        items: itemsToPrint,
        total: totalToPrint,
        label: receiptLabel,
        globalSupplements: supplementsToPrint,
        tableId,
      });

      onClose();
    } finally {
      checkingOutRef.current = false;
    }
  };

  const handleReprintKitchen = async () => {
    try {
      const result = await enqueueKitchenPrint({
        tableId,
        orderLabel: kitchenOrderLabel,
        items,
        orderNote,
        globalSupplements: activeSupplements,
        printers,
      });
      if (result.status === "blocked_unmapped") {
        toast.error("Catégories non associées à une imprimante cuisine", {
          description: result.unmappedNames.join(", "),
          duration: 8000,
        });
      } else if (result.status === "error") {
        toast.error("Réimpression cuisine impossible", { description: result.message });
      } else if (result.status === "enqueued") {
        toast.success("Réimpression cuisine envoyée");
        wakePrintQueueDaemon();
      } else if (result.status === "noop" && result.reason === "empty_delta") {
        toast.info("Rien de nouveau à imprimer en cuisine");
      } else {
        toast.info("Job cuisine déjà en file");
      }
    } catch (err: any) {
      toast.error("Erreur réimpression cuisine", { description: err?.message });
    }
  };

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // Stable callbacks pour les sous-composants
  const handleOpenCheckout = useCallback(() => setCheckoutOpen(true), []);
  const handleNoteChange = useCallback((note: string) => setOrderNote(tableId, note), [tableId, setOrderNote]);

  const handleConfirmSupplement = useCallback((
    id: string,
    supplements: { id: string; label: string; price: number }[]
  ) => {
    const prev = useTableOrdersStore.getState().orders[tableId] || [];
    setOrder(tableId, prev.map((item) =>
      item.id === id
        ? { ...item, supplements }
        : item,
    ));
    setSupplementModalOpen(false);
    setActiveSupplementItem(null);
  }, [tableId, setOrder]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40">
      <div className="flex h-full min-h-0 w-full max-w-5xl bg-background shadow-2xl" style={{ animation: 'slideInRight 180ms ease-out', willChange: 'transform' }}>

        {/* ── DESKTOP: côte à côte ── */}
        <div className="hidden md:flex md:flex-1 md:flex-col overflow-hidden">
          <ProductSelectorDesktop
            tableNumber={tableNumber}
            mergedNumbers={mergedNumbers}
            query={query}
            category={category}
            allCategoryNames={allCategoryNames}
            visibleProducts={visibleProducts}
            loading={loading}
            onClose={onClose}
            onQueryChange={setQuery}
            onCategoryChange={setCategory}
            onProductSelect={handleProductSelect}
          />
        </div>
        <div className="hidden md:flex md:w-[340px] md:shrink-0 md:flex-col border-l border-border overflow-hidden">
          <OrderListDesktop
            tableNumber={tableNumber}
            mergedNumbers={mergedNumbers}
            items={items}
            orderNote={orderNote}
            itemCount={itemCount}
            total={total}
            isOccupied={isOccupied}
            isServeur={isServeur}
            decrease={decrease}
            increase={increase}
            remove={remove}
            onNoteChange={handleNoteChange}
            onValidate={handleValidateOrder}
            onCheckout={handleOpenCheckout}
            validating={validating}
            onReprintKitchen={handleReprintKitchen}
            onAddSupplement={(item) => {
              setActiveSupplementItem(item);
              setSupplementModalOpen(true);
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════
            MOBILE / ANDROID — vue unique combinée
            Haut : catégories + produits (scrollable)
            Bas  : panier intégré (panneau accordéon)
            ══════════════════════════════════════════════════════════ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">

          {/* En-tête */}
          <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Table {tableNumber}</h2>
                {mergedNumbers && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                    Fusion: {mergedNumbers}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Prise de commande</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-muted">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </header>

          {/* Catégories (sticky) */}
          <div className="shrink-0 border-b border-border bg-card px-4 py-2">
            <CategoryTabs active={category} onChange={setCategory} categories={allCategoryNames} />
          </div>

          {/* Recherche */}
          <div className="shrink-0 bg-background px-4 pt-2 pb-2">
            <ProductSearch value={query} onChange={setQuery} />
          </div>

          {/* Grille produits — zone scrollable principale */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 touch-pan-y">
            {loading ? (
              <ComponentLoader />
            ) : visibleProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-semibold text-foreground">Aucun produit</p>
              </div>
            ) : (
              <ProductGrid products={visibleProducts} onSelect={handleProductSelect} />
            )}
          </div>

          {/* ── PANIER INTÉGRÉ EN BAS ─────────────────────────────── */}
          <div className="shrink-0 border-t-2 border-primary/30 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">

            {/* Barre résumé — toujours visible, cliquable pour ouvrir/fermer */}
            <button
              onClick={() => setCartOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 transition-colors active:bg-muted/50"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  {itemCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {itemCount}
                    </span>
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">
                    {itemCount > 0
                      ? `${itemCount} article${itemCount > 1 ? "s" : ""}`
                      : "Panier vide"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {cartOpen ? "Appuyer pour fermer" : "Appuyer pour voir la commande"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {itemCount > 0 && (
                  <span className="text-base font-extrabold text-primary">{formatDA(total)}</span>
                )}
                <span className="text-[10px] font-semibold text-muted-foreground transition-transform duration-200"
                  style={{ display: "inline-block", transform: cartOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  ▲
                </span>
              </div>
            </button>

            {/* Contenu du panier — accordéon */}
            {cartOpen && (
              <div className="flex min-h-0 flex-col border-t border-border" style={{ maxHeight: '70dvh' }}>

                {/* Zone scrollable : articles + note + suppléments */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">
                        Appuyez sur un produit pour l'ajouter
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto p-3">
                      <CartItemsMobile items={items} decrease={decrease} increase={increase} remove={remove} onAddSupplement={(item) => {
                        setActiveSupplementItem(item);
                        setSupplementModalOpen(true);
                      }} />
                    </div>
                  )}

                  {/* Note globale de commande (mobile) */}
                  <div className="border-t border-border px-3 pt-3 pb-3">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <NotebookPen className="h-3.5 w-3.5" />
                      Note de commande
                    </label>
                    <OrderNoteInput value={orderNote} onChange={handleNoteChange} />
                  </div>
                </div>

                {/* Bouton valider / encaisser — toujours visible en bas */}
                <div className="shrink-0 border-t border-border p-3 pb-safe-bottom bg-card">
                  {isOccupied ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={handleValidateOrder}
                          disabled={items.length === 0 || validating}
                          className="flex-1 rounded-xl bg-secondary py-3.5 text-sm font-bold text-secondary-foreground shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {validating ? "Envoi…" : "Mettre à jour"}
                        </button>
                        {!isServeur && (
                          <button
                            onClick={() => setCheckoutOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-bold text-success-foreground shadow-lg transition-all active:scale-[0.98]"
                          >
                            <CreditCard className="h-4 w-4" />
                            Encaisser
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleReprintKitchen}
                        disabled={items.length === 0}
                        className="w-full rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Réimprimer cuisine
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleValidateOrder}
                      disabled={items.length === 0 || validating}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {validating ? "Envoi en cours…" : "Valider la commande"}
                      {!validating && itemCount > 0 && (
                        <span className="ml-1 opacity-80">— {formatDA(total)}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ModifierModal
        item={editing}
        open={modifierOpen}
        onOpenChange={setModifierOpen}
        onConfirm={confirmModifier}
      />

      <SupplementModal
        item={activeSupplementItem}
        open={supplementModalOpen}
        allSupplements={allGlobalSupplements}
        onOpenChange={setSupplementModalOpen}
        onConfirm={handleConfirmSupplement}
      />

      <CheckoutReceiptModal
        open={checkoutOpen}
        tableNumber={tableNumber}
        items={items}
        orderNote={orderNote || undefined}
        globalSupplements={activeSupplements}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={async () => {
          setCheckoutOpen(false);
          await handleCheckout();
        }}
      />

      {optionProduct && (
        <OptionSelectModal
          product={optionProduct}
          onClose={() => setOptionProduct(null)}
          onConfirm={(option) => {
            addProduct(optionProduct, option);
            setOptionProduct(null);
          }}
        />
      )}
    </div>
  );
}
