# Increment 005 — a connected Northline storefront

> Checkout architecture remains current. Increment 006 adds the simpler `/demo` entry and direct order evidence links. Current counts are 65 unit / 54 integration tests; see [GUIDED-DEMO.md](GUIDED-DEMO.md).

## What this demonstrates

**Shop → demo checkout → durable order/job → simulated warehouse → Relay recovery → customer-facing acknowledgement.**

Northline Supply is a fictional everyday-carry merchant with four products: a backpack, tote, organizer, and bottle. Its storefront is not a separate commerce backend or a Shopify integration. It creates orders in the same local database and submission/recovery pipeline already exercised by the Relay lab.

Payment is simulated, all customer details are fixed fiction, and nothing ships. Product photography and the editorial image are AI-generated. Catalog material/feature descriptions are fictional design content, not claims about real merchandise.

The purpose is agency portfolio evidence: a coherent customer experience, safe integration behavior, and an inspectable audit trail—not an enterprise OMS replacement or an assertion of commercial demand.

## Routes

| Route                        | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `/`                          | Existing Relay operations console; sidebar links to Northline          |
| `/store`                     | Catalog, categories, working bag, editorial content                    |
| `/store/products/[slug]`     | Product detail, fixed variant, add to bag                              |
| `/store/checkout`            | Catalog-priced summary, fictional customer, explicit no-charge consent |
| `/store/orders/[id]`         | Polls the persisted purchase status; not shipment tracking             |
| `/presenter`                 | Choose the next new checkout's simulated warehouse outcome             |
| `POST /api/store/checkout`   | Strict local-only checkout write boundary                              |
| `GET /api/store/orders/[id]` | Local-only, minimal customer-facing order projection                   |

Production and fixture modes allow browsing, category filtering, product pages, bag changes, and a disabled checkout preview. They **do not** allow purchases, presenter selection, or order-record reads. This is intentionally not a public multi-user transactional demo. Do not publicly proxy the enabled development lab.

## The connected presentation

Start the existing simulator, worker, and development web app in separate terminals. Use `http://localhost:3000` exactly with the default configuration.

1. Visit `/presenter` and choose **Accepted, response lost**.
2. Open Northline, inspect the Ridge Daypack, add it to your bag, and continue to demo checkout.
3. Confirm the no-charge checkbox and choose **Place demo order**. No customer/card entry is available or necessary.
4. The confirmation page shows an `NL-...` order number. It may show “Confirming with warehouse” before becoming “Warehouse acknowledged.” Fast recovery can complete before the first browser poll.
5. On the confirmation page, choose **See how Relay handled this order** to open its exact persisted evidence (added in 006). The existing Demo lab latest-ten list is also available.
6. Confirm **1 submission**, **1 lookup**, and **Original fulfillment recovered**. Look at the audit rather than equating a completed queue job with successful fulfillment.
7. Return to the customer page: warehouse acknowledgement is visible, with an explicit explanation that it is not packing, shipment, or delivery.

Try **Transient outage, then recovery** for the three-submission path. Persistent outage, lookup unavailable, and address rejection stop at attention/review instead of claiming a successful warehouse handoff.

Normal acceptance creates no exception, so it may not appear in the Exceptions queue. All new lab/storefront runs appear in Demo lab's latest-ten projection. Customer confirmation URLs can still read older storefront orders by UUID while local execution is enabled.

## Presenter selection

Presenter choice is local browser configuration stored in `localStorage`, shared by tabs on the same origin. It is **not authorization** and is not secret. Production controls are disabled and the API independently enforces the existing local-development guards.

- A new checkout captures the selected scenario with its request UUID.
- A pending checkout always retains its original scenario, even if the presenter choice changes.
- After confirmed checkout, the matching selection is cleared; the next new checkout defaults to normal acceptance.
- Use one checkout tab during a presentation. This is not a server-side, globally reserved “next purchase” switch across browsers.

The storefront does not expose failure switches in checkout. Its footer links to the separately labelled presenter view so the demonstration remains discoverable and honest.

## Checkout safety and pricing

The browser submits only a request UUID, supported scenario, and product IDs/quantities. Zod rejects extra fields, including caller totals, unit prices, payment details, and customer details. Limits are 1–4 distinct catalog lines and 1–5 units per line.

`priceCart` resolves the authoritative catalog and uses integer USD minor units. Line ordering is canonicalized for deduplication. The producer stores a purchase snapshot including names, variant, image path, quantity, and unit price. The current application has no purchase-edit endpoint; this is write-once through its APIs, not a new database immutability trigger.

Purchase, synthetic paid order, fulfillment intent, lab run, initial audit event, and pg-boss job commit in **one database transaction**. Storefront runs use `NL-` display numbers while preserving the simulator's existing `relay-lab-<UUID>` reference contract. Recovery continues using the same persisted order amount/reference; cart changes do not change an existing order.

A request UUID can be reused only for the same origin type (lab versus storefront), scenario, and canonical product/quantity cart. Changed input returns 409, not a second purchase. Duplicates return the existing run even after acknowledgement. There is no claim of exactly-once execution at an arbitrary real warehouse.

Before any checkout HTTP request, the client persists its entire request in session storage. If the response is lost, **Retry same demo checkout** uses the same UUID and original cart, including after reload. It does not turn an uncertain response into a new order. A pending checkout's summary takes precedence over later bag edits. Invalid/unreadable pending state blocks checkout rather than silently discarding identity. Browser storage is required to place a new checkout safely; browsing remains available without it.

The bag is stored separately in local storage. Limits are deliberately small. There is no inventory reservation, product administration, promotion engine, actual tax/shipping calculation, or price guarantee across arbitrary deployments. Delivery and tax are explicitly simulated as $0, and no money is collected.

## Customer status is evidence, not optimism

- **Order placed:** persisted; waiting for the submission worker.
- **Confirming with warehouse:** processing or investigating; not yet acknowledged.
- **Needs attention:** rejected or escalated for review. No promise of automatic correction or real support intervention.
- **Warehouse acknowledged:** the same persisted run is accepted. This does not establish packing, dispatch, or delivery.

The status API returns only the order identity, purchase lines, total, timestamp, and projected state. It does not return customer email, scenario, internal audit, queue details, or review diagnostics. Missing/non-storefront IDs return 404. Invalid IDs return 400. Failed reads return redacted 503; the UI keeps any previous result and labels it potentially stale.

Status polling uses bounded fetch timeouts, pauses requests in hidden tabs, and cleans up on unmount. It does not drive fulfillment or recovery.

## Upgrade from 004

Published baseline checked: `6babd90` in `DeadPoet404/relay-ops`, with a source tree identical to the locally prepared 004.

Stop the web app, simulator, and worker before upgrading; leave PostgreSQL running. Apply the downloaded patch with `git am`, then:

```bash
npm ci
npm run db:migrate
npm run queue:init
```

Migration `0003_connected_storefront.sql` adds only `storefront_purchases` and its constraint/index definitions. No existing application data or audit history is rewritten. Old migrations and existing environment files are unchanged. Do not reset or reseed the app database.

Restart the three processes. The shared 100-run cap still applies to both lab scenarios and storefront purchases. Do not delete evidence to make space during routine setup.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Expected: **49 unit tests and 49 database/integration tests**. Database suites require a disposable loopback `_test` database different from the app database. They truncate that test database's application/simulator tables and delete queue jobs. Do not run multiple copies against the same test database.

The new unit cases cover integer catalog pricing, canonical carts, input limits, unknown products, attempted price/customer/payment injection, and honest status projection. Ten new integration tests exercise atomic checkout, concurrent/reordered duplicates, conflicts and namespace separation, rollback after enqueue, timeout lookup recovery, bounded retry with preserved snapshot, and replay after acknowledgement.

### Reproducible browser check (optional)

Playwright is a pinned development dependency. With the configured local web app, simulator, and worker running, install its browser once:

```bash
npx playwright install chromium
```

If Linux reports missing browser system libraries, follow Playwright's dependency-install instructions for your environment. Then:

```bash
RELAY_BROWSER_TESTS=true npm run test:storefront:browser
```

**This creates six actual persisted synthetic orders in the configured application lab and consumes six slots of its 100-run cap.** It does not reset data. Use only a dedicated local synthetic demonstration environment with enough remaining capacity. Never point it at customer data. It is opt-in and is not part of default CI.

The check exercises product/category/bag behavior, consent, all six checkout outcomes, server boundaries, stale-status warnings, mobile overflow, and browser runtime errors. It deliberately loses a committed checkout response, reloads the browser, and verifies a duplicate-safe retry with the same ID. Screenshots go to ignored `test-results/storefront/`.

GitHub Actions runs the core lint/type/unit/database/build checks. Inspect your actual pushed commit's Actions result; local success is not proof of remote success.

## Deferred on purpose

Shopify accounts/apps, real payments, shipping/carrier events, refunds, customer accounts, inventory, authentication, tenant isolation, hosted write-enabled demo sessions, operator address correction, and production deployment. A future shareable interactive demo needs isolated sessions, abuse limits, and an explicit data-retention policy—not simply exposing the current unauthenticated local lab.
