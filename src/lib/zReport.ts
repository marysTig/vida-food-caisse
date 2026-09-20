import { supabase } from "./supabase";
import { type CartItem } from "./cart";

export async function recordZReport(
  items: CartItem[],
  orderType: "table" | "emporter",
  orderOrTableNumber: string | number
) {
  if (items.length === 0) return;

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

  try {
    const { error } = await supabase.from("z_report_history").insert(rows);
    if (error) {
      console.error("Erreur lors de l'enregistrement de l'historique du Rapport Z:", error);
    } else {
      console.log("Historique du Rapport Z enregistré avec succès.");
    }
  } catch (err) {
    console.error("Exception lors de l'enregistrement de l'historique du Rapport Z:", err);
  }
}
