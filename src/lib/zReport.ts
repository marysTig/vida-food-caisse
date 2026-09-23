import { supabase } from "./supabase";
import { type CartItem, lineTotal } from "./cart";
import { toast } from "sonner";

import { type GlobalSupplement } from "./globalSupplementsStore";

export async function recordZReport(
  items: CartItem[],
  orderType: "table" | "emporter",
  orderOrTableNumber: string | number,
  globalSupplements: GlobalSupplement[] = []
) {
  if (items.length === 0 && globalSupplements.length === 0) return;

  const cashoutDate = new Date().toISOString();

  // Item-level rows — each row includes item.supplements as a JSONB snapshot
  // so the Z report viewer has the exact price paid, even if supplements are later renamed/deleted.
  const rows = items.map((item) => {
    // Actual unit base price sold
    let unitPrice = item.selectedOption ? item.selectedOption.price : item.product.price;
    if (item.customPrice !== undefined) {
      unitPrice = item.customPrice;
    }

    // Snapshot of supplement details at time of payment (historical price safety)
    const supplementsSnapshot = item.supplements.map((s) => ({
      id: s.id,
      label: s.label,
      price: s.price,        // price AT MOMENT OF PAYMENT — never recalculate from current DB
    }));

    // supplements total per line (not multiplied by qty — supplements apply once per line)
    const supplementsTotal = item.supplements.reduce((sum, s) => sum + s.price, 0);

    // Full line total: (base + supplements) × quantity — matches lineTotal() in cart.ts
    const lineTotalValue = lineTotal(item);

    return {
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      variant_price: item.selectedOption ? item.selectedOption.price : null,
      variant_name: item.selectedOption ? item.selectedOption.label : null,
      supplements: supplementsSnapshot,  // JSONB snapshot — persists even if supplement is renamed/deleted
      supplements_total: supplementsTotal,
      line_total: lineTotalValue,
      cashout_date: cashoutDate,
      order_type: orderType,
      table_number: orderType === "table" ? String(orderOrTableNumber) : null,
      takeaway_number: orderType === "emporter" ? String(orderOrTableNumber) : null,
    };
  });

  // Legacy: global-level supplements (kept for backward compat — should be empty now that supplements are per-item)
  const supplementRows = globalSupplements.map((supp) => ({
    product_id: `supp-${supp.id}`,
    product_name: `Supplément: ${supp.label}`,
    quantity: 1,
    unit_price: supp.price,
    variant_price: null,
    variant_name: null,
    supplements: [],
    supplements_total: 0,
    line_total: supp.price,
    cashout_date: cashoutDate,
    order_type: orderType,
    table_number: orderType === "table" ? String(orderOrTableNumber) : null,
    takeaway_number: orderType === "emporter" ? String(orderOrTableNumber) : null,
  }));

  const allRows = [...rows, ...supplementRows];

  if (allRows.length === 0) return;

  try {
    const { error } = await supabase.from("z_report_history").insert(allRows);
    if (error) {
      // If the new columns don't exist yet, fall back to the old schema without them
      if (error.code === "42703" || error.message?.includes("column")) {
        const legacyRows = allRows.map(({ supplements: _s, supplements_total: _st, ...rest }) => rest);
        const { error: legacyError } = await supabase.from("z_report_history").insert(legacyRows);
        if (legacyError) {
          console.error("Erreur Rapport Z (legacy):", legacyError);
          toast.error("Rapport Z non enregistré", { description: legacyError.message, duration: 5000 });
        } else {
          const label = orderType === "emporter" ? `À Emporter #${orderOrTableNumber}` : `Table ${orderOrTableNumber}`;
          toast.success("Rapport Z mis à jour", { description: `${items.length} produit(s) — ${label}`, duration: 3000 });
        }
      } else {
        console.error("Erreur Rapport Z:", error);
        toast.error("Rapport Z non enregistré", { description: error.message, duration: 5000 });
      }
    } else {
      const label = orderType === "emporter"
        ? `À Emporter #${orderOrTableNumber}`
        : `Table ${orderOrTableNumber}`;
      toast.success("Rapport Z mis à jour", {
        description: `${items.length} produit(s) enregistré(s) — ${label}`,
        duration: 3000,
      });
    }
  } catch (err: any) {
    console.error("Exception Rapport Z:", err);
    toast.error("Rapport Z — erreur inattendue", {
      description: err?.message ?? "Vérifiez la connexion Supabase.",
      duration: 5000,
    });
  }
}
