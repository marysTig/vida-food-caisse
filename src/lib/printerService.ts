import { type CartItem, lineTotal } from "@/lib/cart";
import { formatDA } from "@/data/menu";
import { type Printer } from "@/lib/printerStore";

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

// Le service gère un registre d'appareils connectés en mémoire
const connectedDevices = new Map<string, BluetoothRemoteGATTCharacteristic>();

export const printerService = {
  /**
   * Connecte une imprimante via Web Bluetooth (nécessite un geste utilisateur)
   */
  async connectPrinter(printer: Printer): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error("Le navigateur ne supporte pas le Web Bluetooth.");
    }

    try {
      // Demande l'appareil à l'utilisateur. 
      // Pour les imprimantes thermiques, le service est souvent l'un de ces UUID standards.
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard Serial Port Profile / Printer service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Generic printer
        ],
        // On pourrait aussi utiliser acceptAllDevices: true pour être plus permissif si on ne connait pas le service
        // acceptAllDevices: true,
        // optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      if (!device.gatt) throw new Error("GATT non supporté par l'appareil.");

      const server = await device.gatt.connect();
      // On récupère le service primaire (on tente le standard '18f0' ou un autre)
      let service;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        // Fallback: prendre le premier service disponible si 18F0 échoue
        const services = await server.getPrimaryServices();
        if (services.length > 0) service = services[0];
        else throw new Error("Aucun service GATT trouvé.");
      }

      // On récupère la première caractéristique d'écriture
      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

      if (!writeChar) {
        throw new Error("Aucune caractéristique d'écriture trouvée.");
      }

      connectedDevices.set(printer.id, writeChar);
      console.log(`[Printer] Imprimante ${printer.name} connectée avec succès.`);
    } catch (error: any) {
      console.error("[Printer] Erreur de connexion:", error);
      throw error;
    }
  },

  /**
   * Vérifie si une imprimante est actuellement connectée (en mémoire)
   */
  isConnected(printerId: string): boolean {
    return connectedDevices.has(printerId);
  },

  /**
   * Envoie des données brutes à une imprimante connectée
   */
  async sendData(printerId: string, data: Uint8Array): Promise<void> {
    const char = connectedDevices.get(printerId);
    if (!char) {
      throw new Error("Imprimante non connectée au navigateur.");
    }
    
    // Découpage en paquets de 512 octets (limite fréquente en BLE)
    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await char.writeValue(chunk);
    }
  },

  /**
   * Helper : Encode une string en Uint8Array (CP437/ASCII simple pour imprimante)
   * Note: Idéalement il faudrait utiliser un encodeur comme iconv-lite pour les accents,
   * mais pour faire simple on remplace les accents ou on utilise TextEncoder.
   */
  encodeText(text: string): Uint8Array {
    // Remplacement basique des accents pour l'ASCII
    const cleanText = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/€/g, "EUR");
    return new TextEncoder().encode(cleanText);
  },

  /**
   * Imprime un ticket de test
   */
  async printTest(printer: Printer): Promise<void> {
    if (!this.isConnected(printer.id)) {
      throw new Error("Veuillez d'abord connecter l'imprimante.");
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

    await this.sendData(printer.id, this.encodeText(ticket));
  },

  /**
   * Imprime un ticket de caisse
   */
  async printReceipt(printerId: string, items: CartItem[], total: number, tableNumber?: string | number): Promise<void> {
    if (!this.isConnected(printerId)) {
      console.warn("[Printer] Imprimante de caisse non connectée, impression ignorée.");
      return;
    }

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
      const name = item.product.name.substring(0, 20); // Tronquer si trop long
      const qtyStr = `${item.quantity}x `.padEnd(4);
      
      ticket += `${qtyStr}${name}\n`;
      if (item.selectedOption) {
        ticket += `    (${item.selectedOption.label})\n`;
      }
      for (const sup of item.supplements) {
        ticket += `    + ${sup.label}\n`;
      }
      // Alignement du prix à droite de manière simpliste
      ticket += `    ${formatDA(lineTotalVal)}\n`;
    }

    ticket += "--------------------------------\n";
    ticket += ALIGN_CENTER + BOLD_ON + `TOTAL : ${formatDA(total)}\n` + BOLD_OFF;
    ticket += "\nMerci de votre visite !\n\n\n\n";
    ticket += CUT_PAPER;

    await this.sendData(printerId, this.encodeText(ticket));
  },

  /**
   * Imprime un ticket Cuisine (Plaque ou Four) en filtrant les produits
   */
  async printKitchen(printer: Printer, items: CartItem[], orderNumber: string | number, orderNote?: string): Promise<void> {
    if (!this.isConnected(printer.id)) {
      console.warn(`[Printer] Imprimante cuisine (${printer.name}) non connectée, impression ignorée.`);
      return;
    }

    // Filtrer les items par catégorie
    const categories = printer.categories || [];
    const filteredItems = items.filter(item => categories.includes(item.product.category));

    if (filteredItems.length === 0) {
      // Rien à imprimer pour ce poste
      return;
    }

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

    await this.sendData(printer.id, this.encodeText(ticket));
  }
};
