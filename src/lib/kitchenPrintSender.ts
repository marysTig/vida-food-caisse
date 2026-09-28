import { supabase } from "./supabase";
import type { KitchenPrintPayload } from "@/components/pos/KitchenPrintHub";

/**
 * Sends a kitchen print broadcast to the Caisse device via Supabase Realtime.
 *
 * Uses a fresh throw-away channel per send to avoid the silent-failure bug
 * where a stale singleton channel (stuck in CHANNEL_ERROR / TIMED_OUT) would
 * swallow every subsequent broadcast without retrying.
 *
 * The receiving side (KitchenPrintHub) runs on the Caisse device — a
 * separate physical device — so there is no self-receive conflict.
 */
export async function sendKitchenBroadcast(payload: KitchenPrintPayload): Promise<void> {
  const channelName = "kitchen-print-hub";

  // Fresh one-shot channel per send
  const channel = supabase.channel(channelName);

  try {
    // Wait for subscription before sending
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("[KitchenPrintSender] Subscription timeout after 8s"));
      }, 8_000);

      channel.subscribe((status) => {
        console.log("[KitchenPrintSender] Channel status:", status);
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR") {
          clearTimeout(timeout);
          reject(new Error("[KitchenPrintSender] Channel error during subscription"));
        }
      });
    });

    console.log("[KitchenPrintSender] Sending broadcast:", payload.printId);
    const result = await channel.send({
      type: "broadcast",
      event: "print_order",
      payload,
    });

    console.log("[KitchenPrintSender] Send result:", result);

    if (result !== "ok") {
      throw new Error(`[KitchenPrintSender] Broadcast returned non-ok: ${result}`);
    }
  } finally {
    // Always clean up dangling channels
    try {
      await supabase.removeChannel(channel);
    } catch {
      // Ignore cleanup errors
    }
  }
}
