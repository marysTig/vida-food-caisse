import { type GlobalSupplement } from "@/lib/globalSupplementsStore";
import { type Printer } from "@/lib/printerStore";
import { type CartItem } from "@/lib/cart";
import {
  acquireKitchenRadio,
  acquireReceiptRadio,
  KitchenAbortedError,
  nativeSendEscPos,
  getRadioMode,
} from "@/lib/bluetoothRadio";
import { openCircuit } from "@/lib/kitchenCircuitBreaker";

declare global {
  interface Window {
    bluetoothSerial?: any;
  }
}

// Constantes ESC/POS basiques
const ESC = "\x1b";
const GS = "\x1d";
const LF = "\n";
const INIT = ESC + "@";
const ALIGN_CENTER = ESC + "a" + "\x01";
const ALIGN_LEFT = ESC + "a" + "\x00";
const BOLD_ON = ESC + "E" + "\x01";
const BOLD_OFF = ESC + "E" + "\x00";
const DOUBLE_HEIGHT_WIDTH = GS + "!" + "\x11";
const NORMAL_SIZE = GS + "!" + "\x00";
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
 * Kitchen path — cancellable; never used for receipts.
 * Opens circuit breaker on MAC failure (not on receipt preempt abort).
 */
async function sendKitchenNative(
  printer: Printer,
  data: Uint8Array,
): Promise<void> {
  if (!printer.mac_address) {
    throw new Error("Adresse MAC non configurée pour " + printer.name);
  }
  const { signal, release } = await acquireKitchenRadio(printer.name);
  try {
    await nativeSendEscPos({
      priority: "kitchen",
      signal,
      printerName: printer.name,
      macAddress: printer.mac_address,
      data,
    });
  } catch (err) {
    if (!(err instanceof KitchenAbortedError)) {
      openCircuit(
        printer.mac_address,
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  } finally {
    release();
  }
}

/**
 * Receipt path — preempts kitchen, never waits on kitchen mutex.
 */
async function sendReceiptNative(
  printer: Printer,
  data: Uint8Array,
): Promise<void> {
  if (!printer.mac_address) {
    throw new Error("Adresse MAC non configurée pour " + printer.name);
  }
  const { release } = await acquireReceiptRadio(printer.name);
  try {
    await nativeSendEscPos({
      priority: "receipt",
      printerName: printer.name,
      macAddress: printer.mac_address,
      data,
    });
  } finally {
    release();
  }
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
      // Ping with receipt priority so admin never queues behind kitchen
      const { release } = await acquireReceiptRadio(`ping:${printer.name}`);
      try {
        await nativeSendEscPos({
          priority: "receipt",
          printerName: printer.name,
          macAddress: printer.mac_address,
          data: new TextEncoder().encode(INIT),
        });
      } finally {
        release();
      }
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
    if (this.isNativePlatform()) return true;
    return webConnectedDevices.has(printerId);
  },

  encodeText(text: string): Uint8Array {
    const cleanText = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/€/g, "EUR");
    return new TextEncoder().encode(cleanText);
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
      // Admin test uses receipt priority (preempt kitchen)
      await sendReceiptNative(printer, data);
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

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const LINE_WIDTH = 32;
    const SEP = "-".repeat(LINE_WIDTH) + "\n";
    const justify = (left: string, right: string, width = LINE_WIDTH) => {
      const spaces = width - left.length - right.length;
      return left + " ".repeat(Math.max(0, spaces)) + right;
    };
    const formatNumber = (num: number) =>
      num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    let ticket = INIT;

    ticket +=
      ALIGN_CENTER +
      DOUBLE_HEIGHT_WIDTH +
      BOLD_ON +
      "LA VIDA FOOD\n" +
      NORMAL_SIZE +
      BOLD_OFF;
    ticket += "GOOD FOOD . GOOD MOOD\n\n";
    ticket += "Merci pour votre visite !\n\n";

    ticket += ALIGN_LEFT;
    ticket += " Seddouk, Bejaia\n";
    ticket += " 0778 46 69 14\n";
    ticket += " @lavidafood\n";

    ticket += ALIGN_CENTER;
    ticket += "\nFast Food with Love\n";
    ticket += ALIGN_LEFT;
    ticket += SEP;

    ticket += justify(`Date : ${dateStr}`, `Heure : ${timeStr}`) + "\n";
    const orderNum = tableNumber ? `#${tableNumber}` : "#---";
    ticket += justify(`N\u00b0 Cmd : ${orderNum}`, `Caisse : 01`) + "\n";
    const tableStr = tableNumber ? tableNumber.toString() : "---";
    ticket += `Table : ${tableStr}\n`;
    ticket += SEP;

    const formatLine = (qte: string, prod: string, pu: string, tot: string) => {
      const q = qte.padEnd(3);
      const p = prod.padEnd(14).substring(0, 14);
      const u = pu.padStart(6);
      const t = tot.padStart(7);
      return justify("", `${q} ${p} ${u} ${t}`, LINE_WIDTH);
    };

    ticket +=
      ALIGN_CENTER +
      BOLD_ON +
      justify("", "Qté Produit        P.U  Total ", LINE_WIDTH) +
      "\n" +
      BOLD_OFF;
    ticket += SEP;

    for (const item of items) {
      let basePrice = item.selectedOption
        ? item.selectedOption.price
        : item.product.price;
      if (item.customPrice !== undefined) {
        basePrice = item.customPrice;
      }
      const productTotal = basePrice * item.quantity;
      const puStr = formatNumber(basePrice);
      const totStr = formatNumber(productTotal);

      let name = item.product.name;
      if (item.selectedOption) {
        name = `${name} ${item.selectedOption.label}`;
      }
      const MAX_PROD_LEN = 14;

      if (name.length > MAX_PROD_LEN) {
        const words = name.split(" ");
        let currentLine = "";
        const lines: string[] = [];
        for (const word of words) {
          if ((currentLine + word).length > MAX_PROD_LEN) {
            lines.push(currentLine.trim());
            currentLine = word + " ";
          } else {
            currentLine += word + " ";
          }
        }
        if (currentLine) lines.push(currentLine.trim());

        ticket +=
          formatLine(item.quantity.toString(), lines[0] ?? "", puStr, totStr) +
          "\n";
        for (let i = 1; i < lines.length; i++) {
          ticket += formatLine("", lines[i] ?? "", "", "") + "\n";
        }
      } else {
        ticket +=
          formatLine(item.quantity.toString(), name, puStr, totStr) + "\n";
      }

      for (const sup of item.supplements) {
        ticket +=
          justify(`    + ${sup.label}`, formatNumber(sup.price), LINE_WIDTH) +
          "\n";
      }
    }

    if (globalSupplements && globalSupplements.length > 0) {
      ticket += SEP;
      ticket += ALIGN_LEFT + BOLD_ON + "Suppléments globaux :\n" + BOLD_OFF;
      for (const supp of globalSupplements) {
        ticket += justify(`+ ${supp.label}`, formatNumber(supp.price)) + "\n";
      }
    }

    ticket += SEP;

    ticket +=
      ALIGN_CENTER +
      BOLD_ON +
      justify("Sous-total :", `${formatNumber(total)} DA`) +
      "\n" +
      BOLD_OFF;
    ticket +=
      BOLD_ON +
      DOUBLE_HEIGHT_WIDTH +
      justify("TOTAL :", `${formatNumber(total)} DA`) +
      "\n" +
      NORMAL_SIZE +
      BOLD_OFF;
    ticket += SEP;

    ticket += ALIGN_CENTER;
    ticket += "         Merci !\n";
    ticket += "A BIENTOT CHEZ\n";
    ticket += "LA VIDA FOOD\n";
    ticket += "♥\n\n\n\n";
    ticket += CUT_PAPER;

    const data = this.encodeText(ticket);
    if (this.isNativePlatform()) {
      await sendReceiptNative(printer, data);
    } else {
      await sendWebBluetooth(printer.id, data);
    }
  },

  /**
   * Kitchen print — cancellable via radio preempt; opens circuit on MAC failure.
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

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const SEP = "--------------------\n";

    let ticket = INIT;

    ticket += ALIGN_CENTER;
    ticket +=
      DOUBLE_HEIGHT_WIDTH + BOLD_ON + "LA VIDA FOOD\n" + NORMAL_SIZE + BOLD_OFF;

    const orderNumStr = String(orderNumber);
    let orderLabel: string;
    if (
      orderNumStr.toLowerCase().startsWith("emport") ||
      orderNumStr.toLowerCase().includes("emporter")
    ) {
      orderLabel = orderNumStr.replace(/^emporter\s*/i, "A EMPORTER ");
    } else {
      orderLabel = `Table ${orderNumStr}`;
    }
    ticket +=
      BOLD_ON + DOUBLE_HEIGHT_WIDTH + orderLabel + "\n" + NORMAL_SIZE + BOLD_OFF;
    ticket += `${dateStr}\n`;
    ticket += `${timeStr}\n`;
    ticket += LF;

    ticket += ALIGN_LEFT;
    for (const item of filteredItems) {
      ticket += SEP;
      let kitchenName = item.product.name;
      if (item.selectedOption) {
        kitchenName = `${item.product.name} ${item.selectedOption.label}`;
      }
      ticket += BOLD_ON + `${item.quantity} x ${kitchenName}\n` + BOLD_OFF;
      for (const sup of item.supplements) {
        ticket += `  + ${sup.label}\n`;
      }
      if (item.note) {
        ticket += `  *** Note: ${item.note} ***\n`;
      }
      ticket += SEP;
    }

    if (globalSupplements && globalSupplements.length > 0) {
      ticket += LF;
      ticket += ALIGN_LEFT;
      ticket += SEP;
      ticket += BOLD_ON + "SUPPLEMENTS DE LA COMMANDE :\n" + BOLD_OFF;
      for (const supp of globalSupplements) {
        ticket += `+ ${supp.label}\n`;
      }
      ticket += SEP;
    }

    if (orderNote) {
      ticket += LF;
      ticket += ALIGN_CENTER + BOLD_ON + `NOTE : ${orderNote}\n` + BOLD_OFF;
    }

    ticket += "\n\n\n\n";
    ticket += CUT_PAPER;

    const data = this.encodeText(ticket);
    if (this.isNativePlatform()) {
      await sendKitchenNative(printer, data);
    } else {
      await sendWebBluetooth(printer.id, data);
    }
  },
};
