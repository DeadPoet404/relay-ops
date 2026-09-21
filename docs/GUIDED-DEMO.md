# Increment 006 — a guided demonstration

Relay now has one starting point: **http://localhost:3000/demo**.

This increment changes presentation and read access, not fulfillment policy. There are no new database migrations, dependencies, payment connections, or production mutations. The storefront, queue, worker, simulator, and bounded recovery remain the ones shipped in 003–005.

## The three-step experience

1. **Choose a problem.** Click Try the demo, keep the recommended **The warehouse reply goes missing**, and click **Shop this demo**.
2. **Make a demo purchase.** Choose a Northline product, add it to the bag, continue to checkout, and confirm that no money will be charged.
3. **See the exact order.** On the confirmation page, click **See how Relay handled this order**. It opens `/runs/<that same UUID>`—not the console's latest-ten list and not another scenario run.

The result page explains the outcome, shows recorded submission/check counts, and offers an expandable audit trail. It links back to that customer's confirmation page. Refreshing or reopening the evidence page never submits an order.

Keep the simulator, worker, and development web app running in three separate terminals:

```bash
npm run simulator
```

```bash
npm run worker
```

```bash
npm run demo:dev
```

Use the exact configured default origin, **http://localhost:3000**. The localhost URL means your own computer. A hosted/chat production preview remains browsing-only. The guide explains this distinction instead of silently enabling public writes.

## Routes and navigation

| Route                    | Purpose                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/demo`                  | Plain-language problem, three-step explanation, working-versus-simulated boundaries                  |
| `/demo/start`            | Six simpler scenario descriptions, recommended first case, resume protection, optional recent result |
| `/runs/[id]`             | Dedicated Relay evidence page for one exact persisted run                                            |
| `GET /api/lab/runs/[id]` | Demo-store-scoped exact run read, independent of the latest-ten window                               |
| `/store/orders/[id]`     | Existing customer page; now links straight to its evidence page                                      |
| `/presenter`             | Retained advanced controls, with a link to the guided flow                                           |
| `/`                      | Existing operations console; now includes Try the guided demo                                        |

Expanded lab runs also offer **Explain this order's result**. Both lab-created and storefront-created runs can be read directly. Only storefront `NL-` orders get the customer-confirmation return link. Seed-only fixture orders are not active runs and do not acquire manufactured runtime evidence.

## Evidence, not a predetermined success animation

`src/demo/journey.ts` derives the summary from persisted state, warehouse reference, attempt counts, pending action, review reason, and an audit-derived `recoveredByLookup` flag. The chosen scenario alone cannot produce a successful result.

- Acknowledgement requires accepted status **and** a saved warehouse reference.
- The no-repeat recovery summary additionally requires one recorded submission claim, at least one lookup claim, and a recorded `reconciled` audit event.
- Multiple attempt claims produce a bounded-recovery summary, not a claim of one submission.
- Rejected/escalated runs remain in human review.
- Queued, scheduled, running, and uncertain outcomes remain pending until evidence establishes otherwise.
- A failed read retains any previous result with a visible **Last known evidence** warning; an unknown ID shows **Order not found**, never a replacement/demo result.

Counts describe **durable claims before HTTP**, not guaranteed physical network calls. A process crash can consume a claim before sending anything. The wording does not claim universal exactly-once external execution. Warehouse acknowledgement is not packing, shipment, or delivery.

The architecture illustration on the landing page is explicitly labelled an illustration, not live execution evidence. The scenario chooser describes what is planned; the result describes what the application actually recorded.

## Safe browser continuity

Starting a guided session sets the existing local presenter selection and a session-level progress flag. It does not place an order, empty the bag, or delete history.

An unfinished checkout takes precedence. Its original cart, scenario, and request UUID remain unchanged; the guide disables a new start and offers **Resume the same checkout**. Corrupt/unreadable pending state blocks starting rather than discarding identity. Storage failures are shown explicitly.

The recent-result shortcut accepts only a valid UUID from the existing browser last-order entry. It is a convenience, not proof an order exists or a form of authentication. Missing data remains a real 404 at the read endpoint.

Presenter selection is local to the browser/origin, not a globally reserved next purchase. Use one checkout tab during a presentation. Existing checkout deduplication and scenario-consumption rules from 005 still apply.

## Read boundary and safety

The new API accepts only GET; no retry/force-submit operation is added. It reuses the existing guards:

- Development mode, explicit local opt-in, and database mode.
- Exact configured loopback Host/Origin and compatible fetch-site metadata.
- UUID validation and demo-store scope.
- `Cache-Control: no-store`, redacted database errors, 400 for invalid IDs, 404 for absent/out-of-scope runs, and 503 for failed reads.

Production/fixture mode returns 403 even with local opt-in set. The evidence page itself displays a local-only explanation and does not fetch records in those modes. These are development safeguards, **not production authentication or tenant isolation**.

Exact reads use the same repeatable-read application projection as the recent-run list, but select one requested UUID before loading its attempts/audit. They work after a run leaves the latest-ten list. They do not query simulator tables, create jobs, reset budgets, append audit events, or probe worker health.

## Upgrade from 005

Published base checked: `79a7355` in `DeadPoet404/relay-ops`, identical in source to local 005 (`06d1423`).

Stop the web app, worker, and simulator before applying the patch. Keep PostgreSQL and existing data/environment files. Then:

```bash
git am "$HOME/Downloads/006-relay-guided-demo.patch"
npm ci
```

**No migration, reseed, queue reset, or database reset is required for 006.** Restart the existing three commands and open `/demo`. If the underlying 005 installation was never initialized, follow its setup separately; do not treat this patch as a replacement for earlier increments.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Expected: **65 unit tests and 54 database/integration tests**. The DB suite is destructive only within its explicitly configured disposable loopback `_test` database. Never use valuable data or run multiple suites against that database concurrently.

New unit coverage includes truthful summaries, evidence requirements, queued/review states, preserved pending checkout identity, browser storage errors, and validated recent shortcuts. New PostgreSQL cases cover exact reads beyond ten runs, missing and out-of-scope records, invalid identity, zero read side effects, and an audit-backed lookup recovery.

### Optional browser checks

With the local development web app, worker, and simulator already running:

```bash
npx playwright install chromium
RELAY_BROWSER_TESTS=true npm run test:guided:browser
RELAY_BROWSER_TESTS=true npm run test:storefront:browser
```

The guided check creates **three** persisted synthetic purchases; the existing storefront check creates **six**. They consume the shared 100-run cap and never reset the app database. Run sequentially, only in a dedicated synthetic lab with enough capacity. Screenshots are ignored under `test-results/guided/` and `test-results/storefront/`.

The guided check exercises the landing/selection/purchase/result path, a deliberately lost checkout response, resume protection, successful and review evidence, recent shortcut, read-only reload, stale/missing/invalid/cross-origin states, mobile overflow, and browser runtime errors. Initial Next.js development compilation can delay the first route; if a check times out, inspect logs and preserve pending identity instead of clearing data or creating replacements.

GitHub Actions runs core checks, not opt-in browser scripts. Inspect the actual run for your pushed commit; local tests do not prove remote success.

## A 60–90 second recording outline (not a claimed recording)

- **0–15s — The problem:** “A customer pays, but a warehouse reply goes missing. Resending blindly risks duplicating the request.” Show `/demo`.
- **15–35s — The purchase:** Choose the missing-reply scenario, shop, and complete no-charge checkout. Show the `NL-...` order number.
- **35–60s — The evidence:** Click See how Relay handled this order. Show one recorded submission, a read-only lookup, and the saved warehouse acknowledgement. Expand the audit.
- **60–75s — The boundary:** “Payment and warehouse are simulated. The database, jobs, HTTP calls, and recovery logic are working. Acknowledged does not mean shipped.”
- **75–90s — The engineering point:** Briefly show an already-prepared review case. “When the outcome cannot be established, automation stops rather than inventing certainty.”

Do not claim saved revenue, real merchant adoption, or production reliability from a synthetic demo. Recording/public deployment and a broader commercial case remain separate follow-up work.
