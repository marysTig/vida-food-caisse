# Phase 0 — Hub print QA checklist

Run on the primary hub Android tablet after deploying Phase 0.

## Logout / session decoupling

- [ ] Set this device as primary hub in Admin → Imprimantes
- [ ] Log out of POS
- [ ] Confirm logcat / console: `[PRINT DAEMON] Started` and hub still claims jobs
- [ ] Enqueue a kitchen job from another logged-in tablet (or re-login briefly, validate, logout)
- [ ] Ticket prints while hub session is logged out

## Burst + priority

- [ ] Valider order that routes to 2 kitchen printers (plaque + four)
- [ ] Immediately Encaisser (caisse receipt)
- [ ] Expect: receipt prints first (or preempts kitchen); kitchen requeues and completes
- [ ] No Admin auto-probe during burst (`[BT PROBE] defer` in logs)

## MAC switch cooldowns

- [ ] Print to printer A then B then C in one burst
- [ ] Logs show `[BT COORD] MAC cooldown` with `1500ms` (receipt) or `4000ms` (kitchen/probe)

## Watchdog

- [ ] Power off one kitchen printer; enqueue a job to that MAC
- [ ] Within ~25s: `[PRINT DAEMON] WATCHDOG` + `[BT] RADIO_FORCE_RESET`
- [ ] Job returns to `pending` (no false `needs_manual` from watchdog alone)
- [ ] Next job to a working printer proceeds after reset

## Deferred probes

- [ ] With pending/printing jobs, tap Admin “Vérifier Bluetooth”
- [ ] UI shows busy / deferred; no RFCOMM open until queue empty
- [ ] After queue drains, probes complete

## Foreground

- [ ] Minimize app during a short queue; return to foreground
- [ ] Print Realtime reconnects; remaining jobs drain
- [ ] Hub FGS notification remains while primary hub
