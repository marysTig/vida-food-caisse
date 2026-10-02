/**
 * Debug session logging for Android/Capacitor.
 *
 * HTTP ingest to 127.0.0.1 is blocked by mixed content (HTTPS WebView → HTTP),
 * so we rely on console.log → `adb logcat` only.
 */
const SESSION = "c5e869";

export function agentDebugLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  hypothesisId?: string,
): void {
  const payload = {
    sessionId: SESSION,
    location,
    message,
    hypothesisId,
    data,
    t: Date.now(),
  };
  console.log(
    `[DBG ${SESSION}] ${message}`,
    data ? JSON.stringify(data) : "",
    hypothesisId ? `· H=${hypothesisId}` : "",
    `· @${location}`,
  );
  // Best-effort ingest (usually blocked on device); never throw.
  try {
    fetch(
      "http://127.0.0.1:7680/ingest/b490126b-dfa2-4a19-9733-3902cacf3768",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": SESSION,
        },
        body: JSON.stringify({ ...payload, timestamp: Date.now() }),
      },
    ).catch(() => {});
  } catch {
    /* ignore */
  }
}
