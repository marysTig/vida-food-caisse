/**
 * Recovery for lazy route chunks that fail to download — a network blip, or a
 * tablet still running the previous build after a Vercel deploy (old hashed
 * chunks are gone). Without this the root error screen stays up until someone
 * taps "Try again"; a full reload fetches the current index + chunks instead.
 * On Android, if the network is down the reload lands on the native offline
 * page, which returns here by itself once the server answers.
 */

const RELOAD_KEY = "vida-chunk-reload-at";
/** Never reload more than once in this window — avoids a reload loop. */
const RELOAD_GUARD_MS = 15_000;

const CHUNK_ERROR_RE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return CHUNK_ERROR_RE.test(msg);
}

/** @returns true when a reload was triggered. */
export function reloadForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — still reload once; the guard is best-effort.
  }
  window.location.reload();
  return true;
}

let installed = false;

/** Vite emits `vite:preloadError` when a dynamic import's preload fails. */
export function installChunkErrorRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForChunkError()) event.preventDefault();
  });
}
