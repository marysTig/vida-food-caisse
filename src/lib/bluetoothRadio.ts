/**
 * Priority Bluetooth radio controller.
 * Receipt always preempts kitchen — Encaisser never waits on kitchen mutex.
 * SPP via cordova-plugin-bluetooth-serial (not BLE GATT).
 */

export const BT_HARD_SETTLE_MS = 1500;
/** Extra cool-down after aborting a kitchen connect before opening caisse. */
export const BT_RECEIPT_PREEMPT_EXTRA_MS = 1000;
/** Connect+write budget after settle (must cover native SPP + channel-1 fallback). */
export const BT_OP_TIMEOUT_MS = 20000;
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

/**
 * ESC/POS SPP: use connectInsecure only.
 * Secure fallback was proven to start a second ConnectThread while the first
 * was still in "Trying fallback..." → Peer connection failed[16] / Injoignable.
 */
export function nativeConnect(
  macAddress: string,
  label: string,
): Promise<"insecure" | "secure"> {
  return new Promise((resolve, reject) => {
    const bs = window.bluetoothSerial;
    if (!bs) {
      reject(new Error("Bluetooth Serial non disponible"));
      return;
    }

    const onOk = (mode: "insecure" | "secure") => {
      btLog("SOCKET_OPEN_OK", `${label} · ${mode}`);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'H',location:'bluetoothRadio.ts:nativeConnect',message:'connect_ok',data:{label,mode},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      resolve(mode);
    };

    const onErr = (mode: string, err: unknown) => {
      btLog("SOCKET_OPEN_ERR", `${label} · ${mode} · ${String(err)}`);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'H',location:'bluetoothRadio.ts:nativeConnect',message:'connect_err',data:{label,mode,err:String(err)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    if (typeof bs.connectInsecure === "function") {
      btLog("SOCKET_OPEN_INSECURE", `${label} · ${macAddress}`);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'H',location:'bluetoothRadio.ts:nativeConnect',message:'try_insecure_only',data:{label},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      bs.connectInsecure(
        macAddress,
        () => onOk("insecure"),
        (err: unknown) => onErr("insecure", err),
      );
      return;
    }

    btLog("SOCKET_OPEN_SECURE", `${label} · ${macAddress}`);
    bs.connect(
      macAddress,
      () => onOk("secure"),
      (err: unknown) => onErr("secure", err),
    );
  });
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
 * Wait for idle radio, then take exclusive ownership for Admin probes.
 * Never preempts kitchen or receipt — probes must not interrupt real jobs.
 */
export async function acquireProbeRadio(
  owner: string,
  maxWaitMs = 20_000,
): Promise<{ release: () => void }> {
  const started = Date.now();
  while (mode !== "idle") {
    if (Date.now() - started > maxWaitMs) {
      btLog("PROBE_DENIED", `radio busy (${mode}) · ${owner}`);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'A',location:'bluetoothRadio.ts:acquireProbeRadio',message:'probe_denied_busy',data:{owner,mode,waitedMs:Date.now()-started},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error(
        "Radio Bluetooth occupée (impression en cours). Réessayez dans un instant.",
      );
    }
    await sleep(150);
  }

  receiptGeneration += 1;
  const gen = receiptGeneration;
  mode = "receipt";
  btLog("PROBE_ACQUIRE", owner);
  // #region agent log
  fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'A',location:'bluetoothRadio.ts:acquireProbeRadio',message:'probe_acquire_idle',data:{owner,waitedMs:Date.now()-started},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (receiptGeneration === gen && mode === "receipt") {
        mode = "idle";
        btLog("PROBE_RELEASE", owner);
      }
    },
  };
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
    // #region agent log
    fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'hub-injoignable',hypothesisId:'E',location:'bluetoothRadio.ts:acquireKitchenRadio',message:'kitchen_denied_receipt_owns',data:{owner},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
 * Never opens a second concurrent SPP session: if another exclusive holder
 * (receipt or Admin probe) is active, wait for it to release first.
 */
export async function acquireReceiptRadio(owner: string): Promise<{
  release: () => void;
}> {
  // CRITICAL: probes and receipts both use mode "receipt". Stealing mid-connect
  // (bumping gen while SOCKET_OPEN is in flight) caused dual SPP → Unable to connect
  // and false "Injoignable" on Admin.
  const waitStart = Date.now();
  while (mode === "receipt") {
    if (Date.now() - waitStart > 45_000) {
      btLog("RECEIPT_WAIT_TIMEOUT", owner);
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'F',location:'bluetoothRadio.ts:acquireReceiptRadio',message:'receipt_wait_timeout',data:{owner,mode},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error("Radio Bluetooth occupée trop longtemps");
    }
    await sleep(100);
  }

  receiptGeneration += 1;
  const gen = receiptGeneration;
  btLog("RECEIPT_PREEMPT", owner);
  // #region agent log
  fetch('http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c5e869'},body:JSON.stringify({sessionId:'c5e869',runId:'post-fix',hypothesisId:'F',location:'bluetoothRadio.ts:acquireReceiptRadio',message:'receipt_acquire_serialized',data:{owner,preemptKitchen:!!kitchenSession,mode,waitedMs:Date.now()-waitStart},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const preemptedKitchen = !!kitchenSession;
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
  // Only hard settle if we just violently preempted a hung kitchen connect
  if (preemptedKitchen) {
    await hardSettleRadio(`receipt-preempt:${owner}`);
    btLog("RECEIPT_PREEMPT_EXTRA", `${BT_RECEIPT_PREEMPT_EXTRA_MS}ms`);
    await sleep(BT_RECEIPT_PREEMPT_EXTRA_MS);
  }

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
        void forceDisconnectNative(`timeout:${printerName}`).then(() => {
          reject(
            new Error(
              `Délai d'attente dépassé pour ${printerName}. L'imprimante est-elle allumée ?`,
            ),
          );
        });
      });
    }, BT_OP_TIMEOUT_MS);

    const doConnect = () => {
      console.log(`[CONNECT START] ${printerName}`);
      btLog("SOCKET_OPEN", `${printerName} · ${macAddress}`);
      void nativeConnect(macAddress, printerName)
        .then(() => {
          if (settled) {
            btLog("SOCKET_OPEN_LATE", printerName);
            void forceDisconnectNative(`late-open:${printerName}`);
            return;
          }
          if (signal?.aborted) {
            onAbort();
            return;
          }
          console.log(`[CONNECTED] ${printerName}`);
          btLog("SOCKET_OPEN_OK", `${printerName} · bytes=${data.byteLength}`);

          // Critical: use a precise ArrayBuffer slice — data.buffer alone can be
          // larger than the Uint8Array view and hang/corrupt the SPP write.
          const writePayload = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          );

          console.log(`[SEND START] ${printerName}`);
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
              console.log(`[SEND COMPLETE] ${printerName}`);
              btLog("SOCKET_WRITE_OK", `${printerName} · bytes=${data.byteLength}`);

              void (async () => {
                await sleep(BT_PRE_DISCONNECT_DRAIN_MS);
                if (settled) return;
                if (signal?.aborted) {
                  onAbort();
                  return;
                }
                // Explicit close: await disconnect callback before settle/resolve
                console.log(`[DISCONNECT START] ${printerName}`);
                btLog("SOCKET_CLOSE", `${printerName} · after-write-flush`);
                await forceDisconnectNative(`after-write:${printerName}`);
                console.log(`[DISCONNECTED] ${printerName}`);
                if (settled) return;
                finish(() => {
                  btLog("SOCKET_SETTLE_DONE", printerName);
                  resolve();
                });
              })();
            },
            (err: unknown) => {
              btLog("SOCKET_WRITE_ERR", `${printerName} · ${String(err)}`);
              void forceDisconnectNative(`write-err:${printerName}`).then(
                () => finish(() => reject(new Error("Erreur écriture: " + err)))
              );
            },
          );
        })
        .catch((err: unknown) => {
          btLog("SOCKET_OPEN_ERR", `${printerName} · ${String(err)}`);
          void forceDisconnectNative(`open-err:${printerName}`).then(
            () => finish(() =>
              reject(
                new Error(
                  "Connexion impossible (Vérifiez l'imprimante): " + err,
                ),
              ),
            ),
          );
        });
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
