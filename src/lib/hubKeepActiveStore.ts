import { useCallback, useEffect, useState } from "react";

/** Explicit preference only — absent means "default to isPrimaryHub". */
const EXPLICIT_KEY = "vida-hub-keep-active-explicit";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function getHubKeepActiveExplicit(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(EXPLICIT_KEY);
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function setHubKeepActiveExplicit(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXPLICIT_KEY, on ? "true" : "false");
  } catch {
    // Ignore quota / private mode
  }
  notify();
}

/** effective = explicit preference, or isPrimaryHub when never set. */
export function getEffectiveHubKeepActive(isPrimaryHub: boolean): boolean {
  const explicit = getHubKeepActiveExplicit();
  return explicit ?? isPrimaryHub;
}

export function useEffectiveHubKeepActive(isPrimaryHub: boolean) {
  const [explicit, setExplicit] = useState<boolean | null>(() =>
    getHubKeepActiveExplicit(),
  );

  useEffect(() => {
    const sync = () => setExplicit(getHubKeepActiveExplicit());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const setKeepActive = useCallback((on: boolean) => {
    setHubKeepActiveExplicit(on);
  }, []);

  const effective = explicit ?? isPrimaryHub;

  return { effective, explicit, setKeepActive };
}
