import { formatDA } from "@/data/menu";
import { type GlobalSupplement } from "@/lib/globalSupplementsStore";
import { type Printer } from "@/lib/printerStore";
import { type CartItem, lineTotal } from "@/lib/cart";

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

/** Max time to wait for connect+write before aborting (user: 2.5–3s). */
const BT_OP_TIMEOUT_MS = 3000;
/** Max time a caller waits to acquire the BT mutex before failing fast. */
const BT_MUTEX_WAIT_MS = 4000;
/** After disconnect, give Android HCI stack time before next connect (different MAC). */
const BT_POST_DISCONNECT_SETTLE_MS = 900;
/** Brief pause after write before disconnect so printer buffer drains. */
const BT_PRE_DISCONNECT_DRAIN_MS = 350;
/** Extra gap the kitchen worker should wait between Plaque → Four. */
export const BT_INTER_PRINTER_GAP_MS = 700;

// Le service gère un registre d'appareils connectés en mémoire (pour Web Bluetooth)
const webConnectedDevices = new Map<string, BluetoothRemoteGATTCharacteristic>();

// ── Bluetooth mutex (single radio — never steal a held lock) ─────────────────
let btLockOwner: string | null = null;
let btLockGeneration = 0;

function btLog(phase: string, printerName: string, detail?: string) {
  const extra = detail ? ` | ${detail}` : "";
  console.log(`[BT] ${phase} · ${printerName}${extra}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireBluetoothLock(owner: string): Promise<number> {
  const started = Date.now();
  while (btLockOwner !== null) {
    if (Date.now() - started >= BT_MUTEX_WAIT_MS) {
      btLog(
        "MUTEX_TIMEOUT",
        owner,
        `held_by=${btLockOwner} waited=${Date.now() - started}ms`,
      );
      throw new Error(
        `Bluetooth occupé (${btLockOwner}). Réessayez dans un instant.`,
      );
    }
    await sleep(100);
  }
  btLockOwner = owner;
  btLockGeneration += 1;
  btLog("MUTEX_ACQUIRE", owner, `gen=${btLockGeneration}`);
  return btLockGeneration;
}

function releaseBluetoothLock(owner: string, generation: number) {
  if (btLockOwner === owner && btLockGeneration === generation) {
    btLockOwner = null;
    btLog("MUTEX_RELEASE", owner, `gen=${generation}`);
  } else {
    btLog(
      "MUTEX_RELEASE_SKIP",
      owner,
      `expected=${owner}/${generation} actual=${btLockOwner}/${btLockGeneration}`,
    );
  }
}

/** Best-effort disconnect; always resolves (never throws). */
function forceDisconnectNative(reason: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.bluetoothSerial) {
      resolve();
      return;
    }
    btLog("SOCKET_CLOSE", "native", reason);
    try {
      window.bluetoothSerial.disconnect(
        () => {
          btLog("SOCKET_CLOSE_OK", "native", reason);
          resolve();
        },
        (err: unknown) => {
          btLog("SOCKET_CLOSE_ERR", "native", `${reason} · ${String(err)}`);
          resolve();
        },
      );
    } catch (e) {
      btLog("SOCKET_CLOSE_THROW", "native", String(e));
      resolve();
    }
  });
}

/**
 * After any print (success or failure): close socket and settle HCI
 * so the next MAC connect does not race the previous session.
 */
export async function settleBluetoothRadio(label = "settle"): Promise<void> {
  await forceDisconnectNative(label);
  await sleep(BT_POST_DISCONNECT_SETTLE_MS);
  btLog("SOCKET_SETTLE_DONE", label, `${BT_POST_DISCONNECT_SETTLE_MS}ms`);
}

export const printerService = {
  isNativePlatform(): boolean {
    return typeof window !== "undefined" && !!window.bluetoothSerial;
  },

  /** True while a native BT job holds the radio. */
  isBluetoothBusy(): boolean {
    return btLockOwner !== null;
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
      const owner = `ping:${printer.name}`;
      const gen = await acquireBluetoothLock(owner);
      try {
        await settleBluetoothRadio(`pre-ping:${printer.name}`);
        await new Promise<void>((resolve, reject) => {
          window.bluetoothSerial.isEnabled(
            () => {
              btLog("SOCKET_OPEN", printer.name, printer.mac_address || "");
              window.bluetoothSerial.connect(
                printer.mac_address,
                () => {
                  btLog("SOCKET_OPEN_OK", printer.name, "ping");
                  void forceDisconnectNative(`ping-done:${printer.name}`).then(() =>
                    resolve(),
                  );
                },
                (err: any) => reject(new Error("Impossible de se connecter: " + err)),
              );
            },
            () => reject(new Error("Le Bluetooth est désactivé sur cet appareil.")),
          );
        });
        await sleep(BT_POST_DISCONNECT_SETTLE_MS);
      } finally {
        releaseBluetoothLock(owner, gen);
      }
      return;
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
      if (!printer.mac_address) {
        throw new Error("Adresse MAC non configurée pour " + printer.name);
      }

      const owner = printer.name;
      const gen = await acquireBluetoothLock(owner);

      try {
        // Always tear down any leftover session before opening a new MAC
        await settleBluetoothRadio(`pre-connect:${printer.name}`);

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            fn();
          };

          const timeoutId = setTimeout(() => {
            finish(() => {
              btLog("SOCKET_TIMEOUT", printer.name, `${BT_OP_TIMEOUT_MS}ms`);
              void forceDisconnectNative(`timeout:${printer.name}`).then(() => {
                reject(
                  new Error(
                    `Délai d'attente dépassé pour ${printer.name}. L'imprimante est-elle allumée ?`,
                  ),
                );
              });
            });
          }, BT_OP_TIMEOUT_MS);

          const doConnect = () => {
            btLog("SOCKET_OPEN", printer.name, printer.mac_address || "");
            window.bluetoothSerial.connect(
              printer.mac_address,
              () => {
                if (settled) {
                  btLog("SOCKET_OPEN_LATE", printer.name, "ignored after timeout");
                  void forceDisconnectNative(`late-open:${printer.name}`);
                  return;
                }
                btLog("SOCKET_OPEN_OK", printer.name, `bytes=${data.byteLength}`);

                window.bluetoothSerial.write(
                  data.buffer,
                  () => {
                    if (settled) {
                      btLog("SOCKET_WRITE_LATE", printer.name, "ignored");
                      void forceDisconnectNative(`late-write:${printer.name}`);
                      return;
                    }
                    btLog("SOCKET_WRITE_OK", printer.name, `bytes=${data.byteLength}`);

                    void (async () => {
                      await sleep(BT_PRE_DISCONNECT_DRAIN_MS);
                      if (settled) return;
                      btLog("SOCKET_CLOSE", printer.name, "after-write");
                      window.bluetoothSerial.disconnect(
                        () => {
                          btLog("SOCKET_CLOSE_OK", printer.name, "after-write");
                          finish(() => {
                            void sleep(BT_POST_DISCONNECT_SETTLE_MS).then(() => {
                              btLog(
                                "SOCKET_SETTLE_DONE",
                                printer.name,
                                `${BT_POST_DISCONNECT_SETTLE_MS}ms`,
                              );
                              resolve();
                            });
                          });
                        },
                        (e: any) => {
                          btLog("SOCKET_CLOSE_ERR", printer.name, String(e));
                          finish(() => {
                            void sleep(BT_POST_DISCONNECT_SETTLE_MS).then(() =>
                              reject(new Error(String(e))),
                            );
                          });
                        },
                      );
                    })();
                  },
                  (err: any) => {
                    btLog("SOCKET_WRITE_ERR", printer.name, String(err));
                    void forceDisconnectNative(`write-err:${printer.name}`).then(() => {
                      finish(() =>
                        reject(new Error("Erreur écriture: " + err)),
                      );
                    });
                  },
                );
              },
              (err: any) => {
                btLog("SOCKET_OPEN_ERR", printer.name, String(err));
                void forceDisconnectNative(`open-err:${printer.name}`).then(() => {
                  finish(() =>
                    reject(
                      new Error(
                        "Connexion impossible (Vérifiez l'imprimante): " + err,
                      ),
                    ),
                  );
                });
              },
            );
          };

          window.bluetoothSerial.isEnabled(
            () => doConnect(),
            () => {
              finish(() =>
                reject(new Error("Le Bluetooth est désactivé sur la tablette !")),
              );
            },
          );
        });
      } catch (err) {
        // Ensure radio is free even if connect never opened
        await forceDisconnectNative(`catch:${printer.name}`);
        await sleep(BT_POST_DISCONNECT_SETTLE_MS);
        throw err;
      } finally {
        releaseBluetoothLock(owner, gen);
      }
      return;
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

  async printReceipt(printer: Printer, items: CartItem[], total: number, tableNumber?: string | number, globalSupplements?: GlobalSupplement[]): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) {
      throw new Error("L'imprimante n'est pas connectée. Veuillez la reconnecter (Web Bluetooth).");
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });

    const LINE_WIDTH = 32;
    const SEP = "-".repeat(LINE_WIDTH) + "\n";
    const justify = (left: string, right: string, width = LINE_WIDTH) => {
      const spaces = width - left.length - right.length;
      return left + " ".repeat(Math.max(0, spaces)) + right;
    };
    const formatNumber = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    let ticket = INIT;

    // --- EN-TÊTE ---
    ticket += ALIGN_CENTER + DOUBLE_HEIGHT_WIDTH + BOLD_ON + "LA VIDA FOOD\n" + NORMAL_SIZE + BOLD_OFF;
    ticket += "GOOD FOOD . GOOD MOOD\n\n";
    ticket += "Merci pour votre visite !\n\n";
    
    // --- INFOS RESTO ---
    ticket += ALIGN_LEFT;
    ticket += " Seddouk, Bejaia\n";
    ticket += " 0778 46 69 14\n";
    ticket += " @lavidafood\n";
    
    ticket += ALIGN_CENTER;
    ticket += "\nFast Food with Love\n";
    ticket += ALIGN_LEFT;
    ticket += SEP;

    // --- METADATA COMMANDE ---
    ticket += justify(`Date : ${dateStr}`, `Heure : ${timeStr}`) + "\n";
    const orderNum = tableNumber ? `#${tableNumber}` : "#---";
    ticket += justify(`N\u00b0 Cmd : ${orderNum}`, `Caisse : 01`) + "\n";
    const tableStr = tableNumber ? tableNumber.toString() : "---";
    ticket += `Table : ${tableStr}\n`;
    ticket += SEP;

    // --- PRODUITS ---
    const formatLine = (qte: string, prod: string, pu: string, tot: string) => {
      const q = qte.padEnd(3);
      const p = prod.padEnd(14).substring(0, 14);
      const u = pu.padStart(6);
      const t = tot.padStart(7);
      return justify("", `${q} ${p} ${u} ${t}`, LINE_WIDTH);
    };

    ticket += ALIGN_CENTER + BOLD_ON + justify("", "Qté Produit        P.U  Total ", LINE_WIDTH) + "\n" + BOLD_OFF;
    ticket += SEP;

    for (const item of items) {
      let basePrice = item.selectedOption ? item.selectedOption.price : item.product.price;
      if (item.customPrice !== undefined) {
        basePrice = item.customPrice;
      }
      const productTotal = basePrice * item.quantity;
      const puStr = formatNumber(basePrice);
      const totStr = formatNumber(productTotal);
      
      // Nom du produit + variante sur la même ligne si possible
      let name = item.product.name;
      if (item.selectedOption) {
        name = `${name} ${item.selectedOption.label}`;
      }
      const MAX_PROD_LEN = 14;
      
      if (name.length > MAX_PROD_LEN) {
        // Retour à la ligne intelligent pour les produits longs
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
        
        ticket += formatLine(item.quantity.toString(), lines[0], puStr, totStr) + "\n";
        for (let i = 1; i < lines.length; i++) {
          ticket += formatLine("", lines[i], "", "") + "\n";
        }
      } else {
        ticket += formatLine(item.quantity.toString(), name, puStr, totStr) + "\n";
      }

      for (const sup of item.supplements) {
        ticket += justify(`    + ${sup.label}`, formatNumber(sup.price), LINE_WIDTH) + "\n";
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

    // --- TOTAUX ---
    ticket += ALIGN_CENTER + BOLD_ON + justify("Sous-total :", `${formatNumber(total)} DA`) + "\n" + BOLD_OFF;
    ticket += BOLD_ON + DOUBLE_HEIGHT_WIDTH + justify("TOTAL :", `${formatNumber(total)} DA`) + "\n" + NORMAL_SIZE + BOLD_OFF;
    ticket += SEP;

    // --- PIED DE PAGE ---
    ticket += ALIGN_CENTER;
    ticket += "         Merci !\n";
    ticket += "A BIENTOT CHEZ\n";
    ticket += "LA VIDA FOOD\n";
    ticket += "♥\n\n\n\n";
    ticket += CUT_PAPER;

    await this.sendData(printer, this.encodeText(ticket));
  },

  async printKitchen(printer: Printer, items: CartItem[], orderNumber: string | number, orderNote?: string, globalSupplements?: GlobalSupplement[]): Promise<void> {
    if (!this.isNativePlatform() && !this.isConnected(printer.id)) {
      throw new Error("L'imprimante n'est pas connectée. Veuillez la reconnecter (Web Bluetooth).");
    }

    if (!items || items.length === 0) {
      throw new Error(`Aucune ligne à imprimer pour ${printer.name}.`);
    }

    // Prefer category_ids (UUID). Fallback to legacy name matching for unmigrated rows.
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
    const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
    const SEP = "--------------------\n";

    let ticket = INIT;

    // ── En-tête restaurant ──────────────────────────────
    ticket += ALIGN_CENTER;
    ticket += DOUBLE_HEIGHT_WIDTH + BOLD_ON + "LA VIDA FOOD\n" + NORMAL_SIZE + BOLD_OFF;

    // Afficher Table N ou A Emporter #N
    const orderNumStr = String(orderNumber);
    let orderLabel: string;
    if (orderNumStr.toLowerCase().startsWith("emport") || orderNumStr.toLowerCase().includes("emporter")) {
      // Déjà formaté comme "EMPORTER #N" — afficher tel quel
      orderLabel = orderNumStr.replace(/^emporter\s*/i, "A EMPORTER ");
    } else {
      orderLabel = `Table ${orderNumStr}`;
    }
    ticket += BOLD_ON + DOUBLE_HEIGHT_WIDTH + orderLabel + "\n" + NORMAL_SIZE + BOLD_OFF;
    ticket += `${dateStr}\n`;
    ticket += `${timeStr}\n`;
    ticket += LF;

    // ── Articles filtrés ────────────────────────────────
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

    // ── Suppléments de la commande (section séparée) ────────
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

    // ── Note globale de commande ─────────────────────────────
    if (orderNote) {
      ticket += LF;
      ticket += ALIGN_CENTER + BOLD_ON + `NOTE : ${orderNote}\n` + BOLD_OFF;
    }

    ticket += "\n\n\n\n";
    ticket += CUT_PAPER;

    await this.sendData(printer, this.encodeText(ticket));
  }
};
