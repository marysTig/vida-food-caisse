import { type GlobalSupplement } from "@/lib/globalSupplementsStore";
import { type Printer } from "@/lib/printerStore";
import { type CartItem } from "@/lib/cart";
import {
  KitchenAbortedError,
  getRadioMode,
} from "@/lib/bluetoothRadio";
import {
  runAdminTestPrint,
  runProductionKitchen,
  runProductionReceipt,
  runProbeConnect,
} from "@/lib/bluetoothCoordinator";
import { openCircuit } from "@/lib/kitchenCircuitBreaker";
import {
  buildKitchenEscPos,
  buildReceiptEscPos,
  encodeEscPosText,
} from "@/lib/escposTickets";

declare global {
  interface Window {
    bluetoothSerial?: any;
  }
}

// Constantes ESC/POS (Admin test ticket)
const ESC = "\x1b";
const GS = "\x1d";
const INIT = ESC + "@";
const ALIGN_CENTER = ESC + "a" + "\x01";
const ALIGN_LEFT = ESC + "a" + "\x00";
const BOLD_ON = ESC + "E" + "\x01";
const BOLD_OFF = ESC + "E" + "\x00";
const CUT_PAPER = GS + "V" + "\x41" + "\x03";

export {
  hardSettleRadio as settleBluetoothRadio,
  BT_HARD_SETTLE_MS,
  KitchenAbortedError,
  getRadioMode,
} from "@/lib/bluetoothRadio";

/** Inter-printer gap = hard settle (1.5s) after full adapter shutdown. */
export const BT_INTER_PRINTER_GAP_MS = 1500;

const webConnectedDevices = new Map<string, any>();

async function sendWebBluetooth(printerId: string, data: Uint8Array): Promise<void> {
  const char = webConnectedDevices.get(printerId);
  if (!char) {
    throw new Error("Imprimante non connectée au navigateur.");
  }
  const chunkSize = 512;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await char.writeValue(chunk);
  }
}

/**
 * Kitchen path — via bluetoothCoordinator (single entry-point).
 * Opens circuit breaker on MAC failure (not on receipt preempt abort).
 */
async function sendKitchenNative(
  printer: Printer,
  data: Uint8Array,
): Promise<void> {
  if (!printer.mac_address) {
    throw new Error("Adresse MAC non configurée pour " + printer.name);
  }
  const ac = new AbortController();
  try {
    const result = await runProductionKitchen({
      jobId: `direct-kitchen:${printer.id}:${Date.now()}`,
      printerName: printer.name,
      macAddress: printer.mac_address,
      data,
      abortSignal: ac.signal,
    });
    if (result === "aborted") {
      throw new KitchenAbortedError();
    }
  } catch (err) {
    if (!(err instanceof KitchenAbortedError)) {
      openCircuit(
        printer.mac_address,
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}

/**
 * Receipt path — via bluetoothCoordinator (single entry-point).
 */
async function sendReceiptNative(
  printer: Printer,
  data: Uint8Array,
): Promise<void> {
  if (!printer.mac_address?.trim()) {
    throw new Error("Adresse MAC non configurée pour " + printer.name);
  }
  await runProductionReceipt({
    jobId: `direct-receipt:${printer.id}:${Date.now()}`,
    printerName: printer.name,
    macAddress: printer.mac_address.trim(),
    data,
  });
}

export const printerService = {
  isNativePlatform(): boolean {
    return typeof window !== "undefined" && !!window.bluetoothSerial;
  },

  isBluetoothBusy(): boolean {
    // Kitchen is preemptible — only block UI hints when receipt owns the radio
    return getRadioMode() === "receipt";
  },

  async getPairedDevices(): Promise<{ name: string; address: string }[]> {
    if (!this.isNativePlatform()) return [];
    return new Promise((resolve, reject) => {
      window.bluetoothSerial.list(
        (devices: any[]) =>
          resolve(devices.map((d) => ({ name: d.name, address: d.address }))),
        (err: any) => reject(new Error(err)),
      );
    });
  },

  async connectPrinter(printer: Printer): Promise<void> {
    if (this.isNativePlatform()) {
      if (!printer.mac_address) {
        throw new Error("Adresse MAC manquante. Veuillez d'abord l'associer.");
      }
      // Ping via coordinator (serialized with production jobs)
      await runAdminTestPrint({
        printer,
        data: new TextEncoder().encode(INIT),
      });
      return;
    }

    if (!(navigator as any).bluetooth) {
      throw new Error("Le navigateur ne supporte pas le Web Bluetooth.");
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "000018f0-0000-1000-8000-00805f9b34fb",
          "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
          "00001101-0000-1000-8000-00805f9b34fb",
        ],
      });

      if (!device.gatt) throw new Error("GATT non supporté par l'appareil.");

      const server = await device.gatt.connect();
      let service;
      try {
        service = await server.getPrimaryService(
          "000018f0-0000-1000-8000-00805f9b34fb",
        );
      } catch {
        const services = await server.getPrimaryServices();
        if (services.length > 0) service = services[0];
        else throw new Error("Aucun service GATT trouvé.");
      }

      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find(
        (c: { properties: { write?: boolean; writeWithoutResponse?: boolean } }) =>
          c.properties.write || c.properties.writeWithoutResponse,
      );

      if (!writeChar) {
        throw new Error("Aucune caractéristique d'écriture trouvée.");
      }

      webConnectedDevices.set(printer.id, writeChar);
      console.log(`[Printer] Imprimante ${printer.name} connectée avec succès (Web).`);
    } catch (error: any) {
      console.error("[Printer] Erreur de connexion:", error);
      throw error;
    }
  },

  isConnected(printerId: string): boolean {
    // Synchronous snapshot only — Admin must use verifyPrinterReachable for real status.
    if (this.isNativePlatform()) return false;
    return webConnectedDevices.has(printerId);
  },

  /**
   * Real Bluetooth reachability check (connect ping + mandatory disconnect).
   * Routed through bluetoothCoordinator — deferred while print_jobs busy.
   */
  async verifyPrinterReachable(printer: Printer): Promise<{
    ok: boolean;
    detail: string;
  }> {
    if (!this.isNativePlatform()) {
      const ok = webConnectedDevices.has(printer.id);
      return {
        ok,
        detail: ok ? "Web Bluetooth connecté" : "Web Bluetooth non connecté",
      };
    }
    const mac = (printer.mac_address ?? "").trim();
    if (!mac) {
      return { ok: false, detail: "Adresse MAC manquante" };
    }
    return runProbeConnect(printer);
  },

  encodeText(text: string): Uint8Array {
    return encodeEscPosText(text);
  },

  async printTest(printer: Printer): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) {
      throw new Error("Veuillez d'abord connecter l'imprimante (Web).");
    }

    let ticket = INIT;
    ticket += ALIGN_CENTER + BOLD_ON + "LA VIDA FOOD\n" + BOLD_OFF;
    ticket += "TEST IMPRESSION\n";
    ticket += "--------------------------------\n";
    ticket += ALIGN_LEFT;
    ticket += `Imprimante : ${printer.name}\n`;
    ticket += `Type : ${printer.type.toUpperCase()}\n`;
    ticket += "Status : OK\n\n";
    ticket += ALIGN_CENTER + "Merci !\n\n\n\n";
    ticket += CUT_PAPER;

    const data = this.encodeText(ticket);
    if (this.isNativePlatform()) {
      await runAdminTestPrint({ printer, data });
    } else {
      await sendWebBluetooth(printer.id, data);
    }
  },

  /**
   * Isolated receipt print — preempts kitchen, never shares kitchen queue/mutex wait.
   * Prefer this for Encaisser.
   */
  async printReceiptIsolated(
    printer: Printer,
    items: CartItem[],
    total: number,
    tableNumber?: string | number,
    globalSupplements?: GlobalSupplement[],
  ): Promise<void> {
    return this.printReceipt(printer, items, total, tableNumber, globalSupplements);
  },

  async printReceipt(
    printer: Printer,
    items: CartItem[],
    total: number,
    tableNumber?: string | number,
    globalSupplements?: GlobalSupplement[],
  ): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) {
      throw new Error(
        "L'imprimante n'est pas connectée. Veuillez la reconnecter (Web Bluetooth).",
      );
    }

    const data = buildReceiptEscPos({
      items,
      total,
      ...(tableNumber !== undefined ? { tableNumber } : {}),
      ...(globalSupplements?.length ? { globalSupplements } : {}),
    });
    if (this.isNativePlatform()) {
      await sendReceiptNative(printer, data);
    } else {
      await sendWebBluetooth(printer.id, data);
    }
  },

  /**
   * Kitchen print — cancellable via radio preempt; opens circuit on MAC failure.
   * Prefer PrintQueueDaemon for POS; kept for Admin / legacy direct print.
   */
  async printKitchenCancellable(
    printer: Printer,
    items: CartItem[],
    orderNumber: string | number,
    orderNote?: string,
    globalSupplements?: GlobalSupplement[],
  ): Promise<void> {
    return this.printKitchen(
      printer,
      items,
      orderNumber,
      orderNote,
      globalSupplements,
    );
  },

  async printKitchen(
    printer: Printer,
    items: CartItem[],
    orderNumber: string | number,
    orderNote?: string,
    globalSupplements?: GlobalSupplement[],
  ): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) {
      throw new Error(
        "L'imprimante n'est pas connectée. Veuillez la reconnecter (Web Bluetooth).",
      );
    }

    if (!items || items.length === 0) {
      throw new Error(`Aucune ligne à imprimer pour ${printer.name}.`);
    }

    const categoryIds = new Set(printer.category_ids ?? []);
    const legacyNames = new Set(printer.categories ?? []);
    const filteredItems = items.filter((item) => {
      const catId = item.product.categoryId;
      if (catId && categoryIds.size > 0) return categoryIds.has(catId);
      if (legacyNames.size > 0) return legacyNames.has(item.product.category);
      return false;
    });

    if (filteredItems.length === 0) {
      throw new Error(
        `Aucune ligne ne correspond aux catégories de ${printer.name}. Vérifiez le mapping catégories.`,
      );
    }

    const data = buildKitchenEscPos({
      items: filteredItems,
      orderNumber,
      ...(orderNote ? { orderNote } : {}),
      ...(globalSupplements?.length ? { globalSupplements } : {}),
    });
    if (this.isNativePlatform()) {
      await sendKitchenNative(printer, data);
    } else {
      await sendWebBluetooth(printer.id, data);
    }
  },
};
