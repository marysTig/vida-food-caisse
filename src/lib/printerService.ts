import { type CartItem, lineTotal } from "@/lib/cart";
import { formatDA } from "@/data/menu";
import { type Printer } from "@/lib/printerStore";

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
const CUT_PAPER = GS + "V" + "\x41" + "\x03"; // Full cut with feed

// Le service gère un registre d'appareils connectés en mémoire (pour Web Bluetooth)
const webConnectedDevices = new Map<string, BluetoothRemoteGATTCharacteristic>();

export const printerService = {
  isNativePlatform(): boolean {
    return typeof window !== "undefined" && !!window.bluetoothSerial;
  },

  /**
   * Retourne la liste des appareils Bluetooth appairés (Android natif uniquement)
   */
  async getPairedDevices(): Promise<{ name: string; address: string }[]> {
    if (!this.isNativePlatform()) return [];
    return new Promise((resolve, reject) => {
      window.bluetoothSerial.list(
        (devices: any[]) => resolve(devices.map(d => ({ name: d.name, address: d.address }))),
        (err: any) => reject(new Error(err))
      );
    });
  },

  /**
   * Connecte une imprimante via Web Bluetooth ou vérifie la dispo sur Android
   */
  async connectPrinter(printer: Printer): Promise<void> {
    if (this.isNativePlatform()) {
      // Sur Capacitor, on connecte/imprime/déconnecte à la volée. 
      // Ici on fait juste un ping pour tester.
      if (!printer.mac_address) throw new Error("Adresse MAC manquante. Veuillez d'abord l'associer.");
      return new Promise((resolve, reject) => {
        window.bluetoothSerial.connect(printer.mac_address, 
          () => {
            window.bluetoothSerial.disconnect();
            resolve();
          }, 
          (err: any) => reject(new Error("Impossible de se connecter: " + err))
        );
      });
    }

    if (!navigator.bluetooth) {
      throw new Error("Le navigateur ne supporte pas le Web Bluetooth.");
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '00001101-0000-1000-8000-00805f9b34fb'
        ]
      });

      if (!device.gatt) throw new Error("GATT non supporté par l'appareil.");

      const server = await device.gatt.connect();
      let service;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        const services = await server.getPrimaryServices();
        if (services.length > 0) service = services[0];
        else throw new Error("Aucun service GATT trouvé.");
      }

      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

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
    if (this.isNativePlatform()) return true; // On connecte à la volée sur natif
    return webConnectedDevices.has(printerId);
  },

  async sendData(printer: Printer, data: Uint8Array): Promise<void> {
    if (this.isNativePlatform()) {
      if (!printer.mac_address) throw new Error("Adresse MAC non configurée pour " + printer.name);
      return new Promise((resolve, reject) => {
        window.bluetoothSerial.connect(printer.mac_address, () => {
          // Sur cordova-plugin-bluetooth-serial on passe simplement un ArrayBuffer
          window.bluetoothSerial.write(data.buffer, () => {
            // Petit délai pour laisser le buffer s'imprimer avant de couper
            setTimeout(() => {
              window.bluetoothSerial.disconnect(() => resolve(), (e: any) => reject(new Error(e)));
            }, 1000);
          }, (err: any) => {
            window.bluetoothSerial.disconnect();
            reject(new Error("Erreur écriture: " + err));
          });
        }, (err: any) => {
          reject(new Error("Erreur connexion Bluetooth (Assurez-vous que l'imprimante est allumée et appairée): " + err));
        });
      });
    }

    // Web Bluetooth
    const char = webConnectedDevices.get(printer.id);
    if (!char) {
      throw new Error("Imprimante non connectée au navigateur.");
    }
    
    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await char.writeValue(chunk);
    }
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

    await this.sendData(printer, this.encodeText(ticket));
  },

  async printReceipt(printer: Printer, items: CartItem[], total: number, tableNumber?: string | number): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR");
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });

    let ticket = INIT;
    ticket += ALIGN_CENTER + DOUBLE_HEIGHT_WIDTH + BOLD_ON + "LA VIDA FOOD\n" + NORMAL_SIZE + BOLD_OFF;
    ticket += "RECU DE PAIEMENT\n";
    if (tableNumber) {
      ticket += `Table / Commande : ${tableNumber}\n`;
    }
    ticket += `${dateStr} - ${timeStr}\n`;
    ticket += "--------------------------------\n";
    
    ticket += ALIGN_LEFT;
    for (const item of items) {
      const lineTotalVal = lineTotal(item);
      const name = item.product.name.substring(0, 20);
      const qtyStr = `${item.quantity}x `.padEnd(4);
      
      ticket += `${qtyStr}${name}\n`;
      if (item.selectedOption) {
        ticket += `    (${item.selectedOption.label})\n`;
      }
      for (const sup of item.supplements) {
        ticket += `    + ${sup.label}\n`;
      }
      ticket += `    ${formatDA(lineTotalVal)}\n`;
    }

    ticket += "--------------------------------\n";
    ticket += ALIGN_CENTER + BOLD_ON + `TOTAL : ${formatDA(total)}\n` + BOLD_OFF;
    ticket += "\nMerci de votre visite !\n\n\n\n";
    ticket += CUT_PAPER;

    await this.sendData(printer, this.encodeText(ticket));
  },

  async printKitchen(printer: Printer, items: CartItem[], orderNumber: string | number, orderNote?: string): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) return;

    const categories = printer.categories || [];
    const filteredItems = items.filter(item => categories.includes(item.product.category));

    if (filteredItems.length === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });

    let ticket = INIT;
    ticket += ALIGN_CENTER + BOLD_ON + `POSTE : ${printer.type.toUpperCase()}\n` + BOLD_OFF;
    ticket += DOUBLE_HEIGHT_WIDTH + `COMMANDE #${orderNumber}\n` + NORMAL_SIZE;
    ticket += `${timeStr}\n`;
    ticket += "--------------------------------\n";
    
    ticket += ALIGN_LEFT;
    for (const item of filteredItems) {
      ticket += BOLD_ON + `${item.quantity} x ${item.product.name}\n` + BOLD_OFF;
      if (item.selectedOption) {
        ticket += `  (${item.selectedOption.label})\n`;
      }
      for (const sup of item.supplements) {
        ticket += `  + ${sup.label}\n`;
      }
      if (item.note) {
        ticket += `  *** Note: ${item.note} ***\n`;
      }
      ticket += "\n";
    }

    if (orderNote) {
      ticket += "--------------------------------\n";
      ticket += BOLD_ON + `NOTE COMMANDE :\n${orderNote}\n` + BOLD_OFF;
    }

    ticket += "\n\n\n\n";
    ticket += CUT_PAPER;

    await this.sendData(printer, this.encodeText(ticket));
  }
};
