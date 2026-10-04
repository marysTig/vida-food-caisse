# Phase 1 — Native Hub Print Worker (follow-up PR)

Status: **spec only**. Phase 0 (JS coordinator + hub lifecycle) ships first.
This document is the implementation contract for the next PR.

## Goal

Move Bluetooth RFCOMM I/O and `print_jobs` drain out of the WebView into a
native Android Foreground Service so the hub prints 24/7 regardless of login,
minimize, or WebView throttle.

## Architecture

```
React UI ──enqueue──► Supabase print_jobs
     │
     └── HubPrintWorkerPlugin (start/stop/status/retry)
                    │
                    ▼
         HubPrintWorkerService (FGS CONNECTED_DEVICE)
                    │
         SingleThreadExecutor (FIFO)
                    │
         EscPosBluetoothPrinter (RFCOMM SPP)
```

When `NATIVE_PRINT_WORKER` is enabled, JS `PrintQueueDaemon` must **not** call
`bluetoothCoordinator` / `bluetoothSerial`. UI only enqueues + shows status.

## Kotlin components

| File | Purpose |
|------|---------|
| `HubPrintWorkerService.kt` | FGS `CONNECTED_DEVICE`; notification with queue depth + last error |
| `print/PrintJobRepository.kt` | Claim/update via Supabase PostgREST; device id = SharedPreferences `vida-print-device-id` (must match JS `printDevice.ts`) |
| `print/EscPosBluetoothPrinter.kt` | Insecure RFCOMM UUID `00001101-0000-1000-8000-00805F9B34FB`; write bytes; drain sleep; disconnect |
| `print/PrintWorkerLoop.kt` | FIFO on executor; receipt priority + kitchen preempt policy ported from JS |
| `HubPrintWorkerPlugin.kt` | Capacitor: `startWorker`, `stopWorker`, `getWorkerStatus`, `triggerManualRetry` |
| `src/lib/hubPrintWorkerPlugin.ts` | TS bridge; auto-start when `isPrimaryHub` |

**Merge:** replace `HubPrintForegroundService.java` (keep-alive only) with the worker service (one FGS).

## State machine (DB-aligned)

| Worker | `print_jobs.status` | Notes |
|--------|---------------------|-------|
| queued | `pending` | Enqueued by any tablet |
| claimed | `printing` + `claimed_by_device_id` | Optimistic claim (same as JS) |
| printing | `printing` | Heartbeat `updated_at` while writing |
| completed | `done` + `printed_at` | Fingerprints may stay JS-side initially |
| failed | `pending` retry or `needs_manual` | Same `MAX_PRINT_ATTEMPTS` |

### Startup reconciliation

On `onCreate` / `onStartCommand`:

1. Close any open socket.
2. Reclaim: all `printing` where `claimed_by_device_id = localId` → `pending`, clear claim, `error = 'Worker restarted'`.

### Supabase on device

- Publishable anon key + existing RLS (verify hub device ops allowed).
- REST claim loop (~500ms when backlog) + Realtime `INSERT` on `print_jobs` for wake.
- Fallback polling if WebSocket drops.

### Dependencies

OkHttp + kotlinx.serialization **or** supabase-kt. No Cordova `bluetoothSerial` on the worker path.

## Capacitor bridge

```ts
interface HubPrintWorkerPlugin {
  startWorker(): Promise<void>;
  stopWorker(): Promise<void>;
  getWorkerStatus(): Promise<{
    running: boolean;
    lastError: string | null;
    queueDepth?: number;
  }>;
  triggerManualRetry(): Promise<void>;
}
```

## Error-handling matrix

| Condition | Detection | Worker action | DB / UX |
|-----------|-----------|---------------|---------|
| RFCOMM connect timeout | Socket connect > 20s | disconnect; hard settle 1.5s; MAC cooldown | retry backoff (receipt 800ms / kitchen 8s) |
| IOException / broken pipe on write | write error | force close; mark radio dirty | retry; after 3 → `needs_manual` |
| Connection lost after kitchen abort | abort + dirty | preempt settle + receipt MAC cooldown | kitchen requeue without attempt++ |
| Buffer not flushed | post-write drain 350ms kitchen | tune from payload size if needed | — |
| Stuck in `printing` | watchdog / no heartbeat | force reset; requeue | same as Phase 0 watchdog |
| Bluetooth off | adapter disabled | fail fast | clear error; no attempt storm |
| Supabase offline | HTTP/WS failure | exponential backoff; keep FGS | jobs stay `pending`; notification |
| Double claim race | update returns 0 rows | skip to next candidate | safe no-op |
| Probe during production | N/A (native) | probes stay JS/Admin-only, deferred | Admin shows busy |

## JS cutover (same follow-up PR)

1. Feature flag `NATIVE_PRINT_WORKER` (default off until validated).
2. When on: hub starts `HubPrintWorkerPlugin.startWorker()`; `PrintQueueDaemon` idles.
3. Keep Phase 0 `bluetoothCoordinator` for web/dev and fallback if native worker fails to start.

## QA before enabling flag

- [ ] Hub logged out prints kitchen + caisse
- [ ] App minimized / screen off for 5+ minutes still drains queue
- [ ] Kill app → FGS restart → reclaim + resume
- [ ] Receipt preempts kitchen without drop
- [ ] Three printers sequential with MAC cooldowns
- [ ] Offline Supabase → jobs remain pending; resume on reconnect
