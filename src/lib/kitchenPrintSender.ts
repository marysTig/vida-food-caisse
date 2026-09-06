import { supabase } from "./supabase";
import type { KitchenPrintPayload } from "@/components/pos/KitchenPrintHub";
import { RealtimeChannel } from "@supabase/supabase-js";

let kitchenChannel: RealtimeChannel | null = null;
let subscriptionPromise: Promise<RealtimeChannel> | null = null;

export function getKitchenChannel(): Promise<RealtimeChannel> {
  if (!kitchenChannel) {
    kitchenChannel = supabase.channel("kitchen-print-hub");
    subscriptionPromise = new Promise((resolve, reject) => {
      kitchenChannel!.subscribe((status) => {
        console.log("[KitchenPrintSender] Channel status:", status);
        if (status === "SUBSCRIBED") {
          resolve(kitchenChannel!);
        } else if (status === "CHANNEL_ERROR") {
          reject(new Error("Supabase Realtime Channel Error"));
        }
      });
    });
  }
  return subscriptionPromise!;
}

export async function sendKitchenBroadcast(payload: KitchenPrintPayload) {
  try {
    const channel = await getKitchenChannel();
    console.log("[KitchenPrintSender] Sending broadcast:", payload.printId);
    return await channel.send({
      type: "broadcast",
      event: "print_order",
      payload,
    });
  } catch (error) {
    console.error("[KitchenPrintSender] Failed to send broadcast:", error);
    throw error;
  }
}
