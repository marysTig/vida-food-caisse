import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { printerService } from "@/lib/printerService";
import { usePrinterStore } from "@/lib/printerStore";
import { toast } from "sonner";
import type { CartItem } from "@/lib/cart";

export type KitchenPrintPayload = {
  printId: string;
  tableId: string;
  tableNumber: number | string;
  items: CartItem[];
  orderNote?: string;
};

export function KitchenPrintHub() {
  const { printers } = usePrinterStore();
  
  // Set d'idempotence pour s'assurer qu'un message Broadcast n'est jamais imprimé deux fois
  // (ex: si l'événement est dupliqué ou renvoyé par erreur).
  // useRef car ce composant n'a pas besoin de re-render quand le set change.
  const processedPrintIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log("[PRINT HUB] Mounting kitchen print hub on Caisse device...");
    
    const channel = supabase.channel("kitchen-print-hub");
    
    channel.on("broadcast", { event: "print_order" }, (payload) => {
      const data = payload['payload'] as KitchenPrintPayload;
      
      console.log(`[PRINT HUB] New server order detected for Table ${data.tableNumber}`);
      
      if (processedPrintIds.current.has(data.printId)) {
        console.log(`[PRINT HUB] Order already processed (printId: ${data.printId})`);
        return;
      }
      
      // Marquer comme traité immédiatement pour éviter toute concurrence
      processedPrintIds.current.add(data.printId);
      
      const kitchenPrinters = printers.filter(p => p.enabled && (p.type === "plaque" || p.type === "four"));
      console.log(`[PRINT HUB] Loading printers: ${kitchenPrinters.length} active kitchen printers`);
      
      for (const printer of kitchenPrinters) {
        // Filtrage des catégories
        const hasMatchingItems = data.items.some(item => printer.categories.includes(item.product.category));
        
        console.log(`[PRINT HUB] Printer category match for ${printer.name}: ${hasMatchingItems}`);
        
        if (hasMatchingItems) {
          console.log(`[PRINT HUB] Sending to printer ${printer.name}...`);
          printerService.printKitchen(printer, data.items, data.tableNumber, data.orderNote)
            .then(() => {
              console.log(`[PRINT HUB] Print success for ${printer.name}`);
            })
            .catch(err => {
              console.error(`[PRINT HUB] Print error on ${printer.name}:`, err);
              toast.error(`Erreur d'impression Hub (${printer.name})`, { 
                description: `Table ${data.tableNumber} : ${err.message}` 
              });
            });
        }
      }
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[PRINT HUB] Successfully subscribed to broadcast channel");
      }
    });

    return () => {
      console.log("[PRINT HUB] Unmounting kitchen print hub");
      supabase.removeChannel(channel);
    };
  }, [printers]); // Re-subscribe if printers change to ensure we use latest printers list

  // Ce composant est invisible
  return null;
}
