# Phase 1 — Native Hub Print Worker

Status: **implemented**.

## Goal

Move Bluetooth RFCOMM I/O and `print_jobs` drain out of the WebView into a
native Android Foreground Service so the hub prints 24/7 regardless of login,
minimize, or WebView throttle.

## Architecture

```
React UI ──enqueue──► Supabase print_jobs
     │
     └── HubPrintWorkerPlugin (start/stop/status/retry/admin)
                    │
                    ▼
         HubPrintWorkerService (FGS CONNECTED_DEVICE)
                    │
         SingleThreadExecutor (FIFO)
                    │
         EscPosBluetoothPrinter (RFCOMM SPP)
```

When the native worker is running (`isNativePrintWorkerActive()`), JS
`PrintQueueDaemon` does **not** call `bluetoothCoordinator` / `bluetoothSerial`.
UI only enqueues + shows status. Phase 0 remains the fallback if start fails.

## Kotlin components

| File | Purpose |
|------|---------|
| `HubPrintWorkerService.kt` | FGS `CONNECTED_DEVICE`; notification with queue depth + last error |
| `print/PrintJobRepository.kt` | Claim/update via Supabase PostgREST; device id from SharedPreferences |
| `print/EscPosBluetoothPrinter.kt` | Insecure RFCOMM UUID `00001101-0000-1000-8000-00805F9B34FB` |
| `print/PrintWorkerLoop.kt` | FIFO loop; receipt priority; admin probe/test on same executor |
| `HubPrintWorkerPlugin.kt` | Capacitor: `startWorker`, `stopWorker`, `getWorkerStatus`, `triggerManualRetry`, `wakeWorker`, `adminProbe`, `adminTestPrint` |
| `src/lib/hubPrintWorkerPlugin.ts` | Capacitor TS bridge; auto-start when `isPrimaryHub` |

## Cutover

- Android primary hub → `HubForegroundSync` calls `startNativePrintWorker()` with
  `deviceId` + `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Credentials persisted in SharedPreferences for `START_STICKY` restart.
- Native REST poll: 500ms busy / 1500ms idle (no native Realtime).
- Kitchen fingerprints patched on `table_orders` after kitchen `done`.

## QA checklist

- [x] Native FGS `HubPrintWorkerService` starts on primary hub; `nativeDrainActive=true`
- [x] JS `PrintQueueDaemon` idles Bluetooth when native owns drain (no dual radio)
- [x] Native claims receipt then kitchen; channel-1 RFCOMM fallback after SPP UUID fail
- [ ] Hub logged out prints kitchen + caisse (needs printers powered/in range)
- [ ] App minimized / screen off for 5+ minutes still drains queue
- [ ] Kill app → FGS restart → reclaim + resume
- [ ] Receipt preempts kitchen without drop
- [ ] Three printers sequential with MAC cooldowns
- [ ] Offline Supabase → jobs remain pending; resume on reconnect
- [ ] Admin probe/test while worker running (same executor)

Verified 2026-10-04 on TAB19 (APK `1.1.3-native-print` / versionCode 5): cutover + claim loop OK;
physical connect failed on both native and Cordova (`Unable to connect`) — printers unreachable.
