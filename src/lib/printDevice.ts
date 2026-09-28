const DEVICE_ID_KEY = "vida-print-device-id";
export const PRINT_SETTINGS_ROW_ID = "00000000-0000-4000-8000-000000000001";

/** Stable per-browser / per-WebView device id for print hub ownership. */
export function getLocalPrintDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral-${Date.now().toString(36)}`;
  }
}
