/**
 * Per-MAC circuit breaker for kitchen Bluetooth printers.
 * After one failure, skip connects to that MAC until the open window expires.
 */

const CIRCUIT_OPEN_MS = 60_000;

type CircuitState = {
  openUntil: number;
  lastError: string;
  failCount: number;
};

const circuits = new Map<string, CircuitState>();

function normalizeMac(mac: string | null | undefined): string {
  return (mac ?? "").trim().toUpperCase().replace(/-/g, ":");
}

export function isCircuitOpen(mac: string | null | undefined): boolean {
  const key = normalizeMac(mac);
  if (!key) return false;
  const state = circuits.get(key);
  if (!state) return false;
  if (Date.now() >= state.openUntil) {
    circuits.delete(key);
    console.log(`[BT] CIRCUIT_CLOSE · ${key} · window expired`);
    return false;
  }
  return true;
}

export function openCircuit(
  mac: string | null | undefined,
  error: string,
): void {
  const key = normalizeMac(mac);
  if (!key) return;
  const prev = circuits.get(key);
  const failCount = (prev?.failCount ?? 0) + 1;
  circuits.set(key, {
    openUntil: Date.now() + CIRCUIT_OPEN_MS,
    lastError: error,
    failCount,
  });
  console.log(
    `[BT] CIRCUIT_OPEN · ${key} · ${CIRCUIT_OPEN_MS}ms · fails=${failCount} · ${error}`,
  );
}

export function getCircuitError(mac: string | null | undefined): string | null {
  const key = normalizeMac(mac);
  if (!key) return null;
  const state = circuits.get(key);
  if (!state || Date.now() >= state.openUntil) return null;
  return state.lastError;
}

/** Manual close (e.g. admin retry / test print). */
export function closeCircuit(mac: string | null | undefined): void {
  const key = normalizeMac(mac);
  if (!key) return;
  if (circuits.delete(key)) {
    console.log(`[BT] CIRCUIT_CLOSE · ${key} · manual`);
  }
}

export function listOpenCircuits(): {
  mac: string;
  openUntil: number;
  lastError: string;
}[] {
  const now = Date.now();
  const out: { mac: string; openUntil: number; lastError: string }[] = [];
  for (const [mac, state] of circuits) {
    if (now < state.openUntil) {
      out.push({ mac, openUntil: state.openUntil, lastError: state.lastError });
    }
  }
  return out;
}

export { CIRCUIT_OPEN_MS, normalizeMac };
