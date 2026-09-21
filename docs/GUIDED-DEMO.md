# Increment 007 — persistent live order journey

Relay now shows one order's progress everywhere: **a fixed live-journey widget that follows you from store to evidence**.

This increment adds presentation pacing and persistent animated stages, not fulfillment policy. There are no new payment connections, real shipments, or production mutations. The storefront, queue, worker, simulator, and bounded recovery remain 003–005, with guided exact reads from 006.

## The experience

1. **Choose a problem** at `/demo/start` — recommended **The warehouse reply goes missing**.
2. **Make a demo purchase** at Northline. The bag, checkout, and request ID are preserved. Checkout now sets `paced: true` — real pacing, not a fake loader.
3. **Watch the live tracker**. A compact widget at bottom-right (bottom sheet on mobile) shows:
   - `Order recorded` — saved locally, pacing enabled
   - `Warehouse submission` — queued with countdown, then submitting (first handoff pauses 2s after durable claim)
   - `Checking confirmation` — "No reply yet. Checking original order." or retry copy
   - `Order confirmed` / `Needs review` — final outcome with truthful summary
   Short copy states exactly what is going on in real time. Progress bar animates with shimmer, active dot pings.
4. **Open the exact evidence** via widget or **See how Relay handled this order**. Same UUID everywhere, no searching.

Keep three terminals:

```bash
npm run simulator
npm run worker
npm run demo:dev
```

Open **http://localhost:3000/demo** (not chat preview). Production preview remains browsing-only.

## Pacing — real delays, not fake progress

- **6s queue delay**: `lab_runs.submission_not_before` + pg-boss `startAfter`. Job not delivered before due. Audit event `demo_pacing_enabled` records the policy.
- **2s first handoff**: after durable claim and advisory lock, before HTTP. Crash during pause becomes interrupted → lookup, never blind resubmit. Recovery budgets unchanged.
- All storefront purchases are paced (`paced: true`). Lab presenter remains unpaced for fast tests.
- Worker defensively checks `submission_not_before`; if early (clock skew), job retries after 2s via pg-boss retry.

The widget shows countdown "submitting in Xs" when queued, and "first handoff pauses 2s after durable claim" when running.

## Persistent widget — implementation

- `src/demo/pacing.ts` — constants `DEMO_QUEUE_DELAY_MS=6000`, `DEMO_HANDOFF_DELAY_MS=2000`
- `src/demo/live-stages.ts` — pure derivation of 4 stages from `LabRun` (attemptCount, lookupCount, pendingAction, demoPacing, submissionNotBefore)
- `src/components/live-journey.tsx` + `live-journey.css` — client widget mounted in root layout, reads `localStorage northline.lastOrder`, `sessionStorage northline.checkout`, path ID, polls `/api/lab/runs/[id]` every 2.5s, 1s tick for countdown, collapsible, pointer-events none except interactive controls to avoid blocking page actions.
- `src/app/layout.tsx` — mounts widget everywhere.
- `src/components/store-order.tsx` — now shows 4-stage animated progress matching live journey, with pacing note.
- `src/app/demo/page.tsx` — mentions persistent tracker and pacing.
- `src/components/run-evidence.tsx` — adds pacing strip and live journey inline.

The widget hides when no active order. Dismiss is local only. Reduced-motion disables animations.

## Read boundary and safety (unchanged + paced)

Same guards as 006: dev mode, explicit opt-in, database mode, loopback Host/Origin, UUID validation, demo-store scope, no-store, 400/404/503/403, GET only. Production/fixture returns 403. Exact reads use repeatable-read projection, select one UUID before attempts/audit, no side effects.

New columns: `lab_runs.demo_pacing boolean NOT NULL DEFAULT false`, `submission_not_before timestamptz`, check constraint consistent. Migration `0004_live_journey_pacing.sql`.

`checkoutSchema` now allows optional `paced` boolean; `createRun` requires cart for paced and checks demoPacing equality on duplicate detection.

## Upgrade from 006

Published base: 006 `698f659` (remote main after 006 push), local 006 `698f659`.

Stop web/worker/simulator, keep PG/data/env:

```bash
git am "$HOME/Downloads/007-relay-live-journey.patch"
npm ci
npm run db:migrate
```

**Migration required for 007** — adds pacing columns, no data loss. Then restart three commands and open `/demo`.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
RELAY_BROWSER_TESTS=true npm run test:guided:browser
RELAY_BROWSER_TESTS=true npm run test:storefront:browser
```

- **65 unit + 54 DB** all pass (same as 006, plus pacing logic covered by existing integration)
- Guided browser: 3 synthetic paced purchases, pending identity preserved, exact evidence, pacing countdown visible, widget does not block actions, mobile, no runtime errors.
- Storefront browser: 6 flows with persisted counts, pacing visible, live tracker persists.
- Build: optimized production build pass.
- Lint/types: pass (pointer-events fix for widget).

Counts remain durable claims before HTTP, not proof of physical calls. Warehouse ack ≠ packing/shipment. Pacing is presentation — policy unchanged.
