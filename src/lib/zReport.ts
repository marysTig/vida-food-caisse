import { supabase } from "./supabase";
import { type CartItem } from "./cart";
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

  const rows = items.map((item) => {
    // Calcul du prix unitaire de base réellement vendu
    let unitPrice = item.selectedOption ? item.selectedOption.price : item.product.price;
    if (item.customPrice !== undefined) {
      unitPrice = item.customPrice;
    }

    // Calcul du total de la ligne avec les suppléments
    const extras = item.supplements.reduce((sum, s) => sum + s.price, 0);
    const lineTotal = (unitPrice + extras) * item.quantity;

    return {
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      variant_price: item.selectedOption ? item.selectedOption.price : null,
      variant_name: item.selectedOption ? item.selectedOption.label : null,
      line_total: lineTotal,
      cashout_date: cashoutDate,
      order_type: orderType,
      table_number: orderType === "table" ? String(orderOrTableNumber) : null,
      takeaway_number: orderType === "emporter" ? String(orderOrTableNumber) : null,
    };
  });

  const supplementRows = globalSupplements.map((supp) => ({
    product_id: `supp-${supp.id}`,
    product_name: `Supplément: ${supp.label}`,
    quantity: 1,
    unit_price: supp.price,
    variant_price: null,
    variant_name: null,
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
      console.error("Erreur Rapport Z:", error);
      toast.error("Rapport Z non enregistré", {
        description: error.message,
        duration: 5000,
      });
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

