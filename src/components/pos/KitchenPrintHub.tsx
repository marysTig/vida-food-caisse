import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { printerService } from "@/lib/printerService";
import { usePrinterStore } from "@/lib/printerStore";
import { toast } from "sonner";
import type { CartItem } from "@/lib/cart";
import type { Printer } from "@/lib/printerStore";

export type KitchenPrintPayload = {
  printId: string;
  tableId: string;
  tableNumber: number | string;
  items: CartItem[];
  orderNote?: string;
};

export function KitchenPrintHub() {
  const { printers } = usePrinterStore();

  // Ref toujours à jour avec la dernière liste d'imprimantes —
  // cela évite de recréer le canal Supabase à chaque fois que printers change.
  const printersRef = useRef<Printer[]>(printers);
  useEffect(() => {
    printersRef.current = printers;
  }, [printers]);

  // Set d'idempotence : un broadcast ne sera jamais imprimé deux fois.
  const processedPrintIds = useRef<Set<string>>(new Set());

  // Canal Supabase créé UNE SEULE FOIS au montage du composant.
  useEffect(() => {
    console.log("[PRINT HUB] Mounting kitchen print hub on Caisse device...");

    const channel = supabase.channel("kitchen-print-hub");

    channel
      .on("broadcast", { event: "print_order" }, (payload) => {
        const data = payload["payload"] as KitchenPrintPayload;

        console.log(
          `[PRINT HUB] New server order detected for Table ${data.tableNumber}`
        );

        if (processedPrintIds.current.has(data.printId)) {
          console.log(
            `[PRINT HUB] Order already processed (printId: ${data.printId})`
          );
          return;
        }

        // Marquer immédiatement pour éviter toute concurrence
        processedPrintIds.current.add(data.printId);

        // Lire la liste d'imprimantes depuis le ref (toujours à jour)
        const kitchenPrinters = printersRef.current.filter(
          (p) => p.enabled && (p.type === "plaque" || p.type === "four")
        );
        console.log(
          `[PRINT HUB] Loading printers: ${kitchenPrinters.length} active kitchen printers`
        );

        if (kitchenPrinters.length === 0) {
          console.warn(
            "[PRINT HUB] No kitchen printers configured or enabled."
          );
          toast.warning("Aucune imprimante cuisine configurée ou activée.");
          return;
        }

        // Exécution séquentielle — évite les conflits Bluetooth simultanés
        (async () => {
          for (const printer of kitchenPrinters) {
            const hasMatchingItems = data.items.some((item) =>
              printer.categories.includes(item.product.category)
            );

            console.log(
              `[PRINT HUB] Printer category match for ${printer.name}: ${hasMatchingItems}`
            );

            if (hasMatchingItems) {
              console.log(
                `[PRINT HUB] Sending to printer ${printer.name}...`
              );
              try {
                await printerService.printKitchen(
                  printer,
                  data.items,
                  data.tableNumber,
                  data.orderNote
                );
                console.log(`[PRINT HUB] Print success for ${printer.name}`);
              } catch (err: any) {
                console.error(
                  `[PRINT HUB] Print error on ${printer.name}:`,
                  err
                );
                toast.error(`Erreur d'impression Hub (${printer.name})`, {
                  description: `Table ${data.tableNumber} : ${err.message}`,
                });
              }
            }
          }
        })();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(
            "[PRINT HUB] Successfully subscribed to broadcast channel"
          );
        } else if (status === "CHANNEL_ERROR") {
          console.error("[PRINT HUB] Broadcast channel error");
          toast.error("Erreur de connexion au hub d'impression.");
        }
      });

    return () => {
      console.log("[PRINT HUB] Unmounting kitchen print hub");
      supabase.removeChannel(channel);
    };
  }, []); // ← dépendances vides : canal créé une seule fois, printers lus via ref

  // Composant invisible
  return null;
}
