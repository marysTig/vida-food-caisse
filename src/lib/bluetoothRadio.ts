/**
 * Priority Bluetooth radio controller.
 * Receipt always preempts kitchen — Encaisser never waits on kitchen mutex.
 * SPP via cordova-plugin-bluetooth-serial (not BLE GATT).
 */

export const BT_HARD_SETTLE_MS = 1500;
/** Connect+write budget after settle (sole timeout owner for daemon jobs). */
export const BT_OP_TIMEOUT_MS = 8000;
export const BT_PRE_DISCONNECT_DRAIN_MS = 350;
/** Max wait for disconnect callback before continuing settle. */
export const BT_DISCONNECT_CALLBACK_CAP_MS = 500;

export type RadioMode = "idle" | "kitchen" | "receipt";

export class KitchenAbortedError extends Error {
  constructor(message = "Impression cuisine interrompue (priorité caisse)") {
    super(message);
    this.name = "KitchenAbortedError";
  }
}

function btLog(phase: string, detail?: string) {
  console.log(`[BT] ${phase}${detail ? ` · ${detail}` : ""}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type KitchenSession = {
  abortController: AbortController;
  release: () => void;
};

let mode: RadioMode = "idle";
let kitchenSession: KitchenSession | null = null;
let receiptGeneration = 0;

export function getRadioMode(): RadioMode {
  return mode;
}

export function isKitchenAborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

/** Force native disconnect; resolves after plugin callback or cap. */
export function forceDisconnectNative(reason: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.bluetoothSerial) {
      resolve();
      return;
    }
    btLog("SOCKET_CLOSE", reason);
    let done = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(cap);
      if (ok) btLog("SOCKET_CLOSE_OK", reason);
      else btLog("SOCKET_CLOSE_ERR", `${reason} · ${String(err ?? "")}`);
      resolve();
    };
    const cap = setTimeout(() => {
      btLog("SOCKET_CLOSE_CAP", `${reason} · ${BT_DISCONNECT_CALLBACK_CAP_MS}ms`);
      finish(false, "disconnect callback timeout");
    }, BT_DISCONNECT_CALLBACK_CAP_MS);

    try {
      window.bluetoothSerial.disconnect(
        () => finish(true),
        (err: unknown) => finish(false, err),
      );
    } catch (e) {
      finish(false, e);
    }
  });
}

/** Full adapter shutdown + hard settle before next connect. */
export async function hardSettleRadio(label: string): Promise<void> {
  await forceDisconnectNative(label);
  btLog("SOCKET_SETTLE", `${label} · ${BT_HARD_SETTLE_MS}ms`);
  await sleep(BT_HARD_SETTLE_MS);
  btLog("SOCKET_SETTLE_DONE", label);
}

/**
 * Acquire kitchen ownership. Fails immediately if receipt owns the radio
 * or if a receipt preempt is already in flight.
 */
export async function acquireKitchenRadio(
  owner: string,
): Promise<{ signal: AbortSignal; release: () => void }> {
  if (mode === "receipt") {
    btLog("KITCHEN_DENIED", `receipt owns radio · ${owner}`);
    throw new KitchenAbortedError();
  }
  // Wait briefly only if another kitchen session is releasing
  const started = Date.now();
  while (mode === "kitchen" && kitchenSession) {
    if (Date.now() - started > 200) {
      btLog("KITCHEN_DENIED", `another kitchen session · ${owner}`);
      throw new Error("Une autre impression cuisine est en cours.");
    }
    await sleep(50);
  }

  const abortController = new AbortController();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (kitchenSession?.abortController === abortController) {
      kitchenSession = null;
      if (mode === "kitchen") mode = "idle";
      btLog("KITCHEN_RELEASE", owner);
    }
  };

  mode = "kitchen";
  kitchenSession = { abortController, release };
  btLog("KITCHEN_ACQUIRE", owner);
  return { signal: abortController.signal, release };
}

/**
 * Preempt kitchen and take receipt ownership.
 * Never waits on kitchen completion — aborts + disconnects immediately.
 */
export async function acquireReceiptRadio(owner: string): Promise<{
  release: () => void;
}> {
  receiptGeneration += 1;
  const gen = receiptGeneration;
  btLog("RECEIPT_PREEMPT", owner);

  if (kitchenSession) {
    btLog("KITCHEN_ABORT", `preempted by receipt · ${owner}`);
    kitchenSession.abortController.abort();
    try {
      kitchenSession.release();
    } catch {
      /* ignore */
    }
    kitchenSession = null;
  }

  mode = "receipt";
  // Single hard settle here — nativeSendEscPos skips pre-settle when skipPreSettle
  await hardSettleRadio(`receipt-preempt:${owner}`);

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (receiptGeneration === gen && mode === "receipt") {
        mode = "idle";
        btLog("RECEIPT_RELEASE", owner);
      }
    },
  };
}

export type NativeSendOptions = {
  priority: "kitchen" | "receipt";
  signal?: AbortSignal;
  printerName: string;
  macAddress: string;
  data: Uint8Array;
  /** When true, skip the opening hardSettle (caller already settled). */
  skipPreSettle?: boolean;
  /** When true, resolve right after disconnect (no trailing 1.5s settle). */
  skipPostSettle?: boolean;
};

/**
 * Connect → write → disconnect (await callback) → hard settle.
 * Kitchen ops honor AbortSignal (receipt preempt).
 */
export async function nativeSendEscPos(opts: NativeSendOptions): Promise<void> {
  const { printerName, macAddress, data, signal, skipPreSettle, skipPostSettle } =
    opts;

  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new KitchenAbortedError();
    }
  };

  throwIfAborted();
  if (!skipPreSettle) {
    await hardSettleRadio(`pre-connect:${printerName}`);
  } else {
    btLog("SOCKET_PRESETTLE_SKIP", printerName);
  }
  throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = () => {
      finish(() => {
        btLog("KITCHEN_ABORT", printerName);
        void forceDisconnectNative(`abort:${printerName}`).then(() => {
          reject(new KitchenAbortedError());
        });
      });
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    const timeoutId = setTimeout(() => {
      finish(() => {
        btLog("SOCKET_TIMEOUT", `${printerName} · ${BT_OP_TIMEOUT_MS}ms`);
        void forceDisconnectNative(`timeout:${printerName}`).then(async () => {
          await sleep(BT_HARD_SETTLE_MS);
          reject(
            new Error(
              `Délai d'attente dépassé pour ${printerName}. L'imprimante est-elle allumée ?`,
            ),
          );
        });
      });
    }, BT_OP_TIMEOUT_MS);

    const doConnect = () => {
      btLog("SOCKET_OPEN", `${printerName} · ${macAddress}`);
      window.bluetoothSerial.connect(
        macAddress,
        () => {
          if (settled) {
            btLog("SOCKET_OPEN_LATE", printerName);
            void forceDisconnectNative(`late-open:${printerName}`);
            return;
          }
          if (signal?.aborted) {
            onAbort();
            return;
          }
          btLog("SOCKET_OPEN_OK", `${printerName} · bytes=${data.byteLength}`);

          // Critical: use a precise ArrayBuffer slice — data.buffer alone can be
          // larger than the Uint8Array view and hang/corrupt the SPP write.
          const writePayload = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          );

          window.bluetoothSerial.write(
            writePayload,
            () => {
              if (settled) {
                btLog("SOCKET_WRITE_LATE", printerName);
                void forceDisconnectNative(`late-write:${printerName}`);
                return;
              }
              if (signal?.aborted) {
                onAbort();
                return;
              }
              btLog("SOCKET_WRITE_OK", `${printerName} · bytes=${data.byteLength}`);

              void (async () => {
                await sleep(BT_PRE_DISCONNECT_DRAIN_MS);
                if (settled) return;
                if (signal?.aborted) {
                  onAbort();
                  return;
                }
                // Explicit close: await disconnect callback before settle/resolve
                btLog("SOCKET_CLOSE", `${printerName} · after-write-flush`);
                await forceDisconnectNative(`after-write:${printerName}`);
                if (settled) return;
                finish(() => {
                  if (skipPostSettle) {
                    btLog("SOCKET_SETTLE_SKIP", printerName);
                    resolve();
                    return;
                  }
                  void sleep(BT_HARD_SETTLE_MS).then(() => {
                    btLog(
                      "SOCKET_SETTLE_DONE",
                      `${printerName} · ${BT_HARD_SETTLE_MS}ms`,
                    );
                    resolve();
                  });
                });
              })();
            },
            (err: unknown) => {
              btLog("SOCKET_WRITE_ERR", `${printerName} · ${String(err)}`);
              void forceDisconnectNative(`write-err:${printerName}`).then(
                async () => {
                  await sleep(BT_HARD_SETTLE_MS);
                  finish(() => reject(new Error("Erreur écriture: " + err)));
                },
              );
            },
          );
        },
        (err: unknown) => {
          btLog("SOCKET_OPEN_ERR", `${printerName} · ${String(err)}`);
          void forceDisconnectNative(`open-err:${printerName}`).then(
            async () => {
              await sleep(BT_HARD_SETTLE_MS);
              finish(() =>
                reject(
                  new Error(
                    "Connexion impossible (Vérifiez l'imprimante): " + err,
                  ),
                ),
              );
            },
          );
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
}

export { btLog, sleep };
