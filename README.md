# Relay

### Order exception & recovery console

Relay explores the systems between payment and fulfillment: **which orders are stuck, what evidence do we have, and what is safe to do next?**

**Current increment: 006 — guided order-recovery demonstration.** The console, PostgreSQL persistence, durable queue, background worker, and HTTP warehouse simulator work together. All customers, paid orders, and warehouse records remain fictional. There is no Shopify integration, real shipment creation, production authentication, address correction, or permission to force a submission. Bounded retries and reference lookups operate only against the local simulator.

## Local setup

Requires **Node.js 22.12+**, npm, and PostgreSQL 17. `.nvmrc` selects Node 22. Docker Compose v2 is the provided database setup; an equivalent native PostgreSQL installation also works.

```bash
npm ci
test -f .env || cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run queue:init
npm run demo:configure
```

`db:seed` inserts the Northline example dataset once and never overwrites compatible existing records. Application migrations are committed under `drizzle/`; pg-boss manages a separate `relay_jobs` schema. `queue:init` installs that schema and submission, recovery, and minutely reconciliation queues; it does not start a worker.

`demo:configure` enables local execution and generates/retains a private simulator token in the ignored `.env.local`. It preserves unrelated settings and does not print the token. `.env.local` overrides `.env`, but exported shell variables take precedence over both. Restart processes after changes.

Use three terminals in the project root:

```bash
# Terminal 1 — simulated warehouse
npm run simulator
```

```bash
# Terminal 2 — durable job consumer
npm run worker
```

```bash
# Terminal 3 — loopback development web app
npm run demo:dev
```

Open **http://localhost:3000**, then Demo lab. Use that exact origin unless you deliberately change `RELAY_DEMO_ORIGIN`. Both `dev` and `demo:dev` bind to loopback by default. Do not expose an enabled local lab through a public proxy.

## A purchase you can follow

Start at **http://localhost:3000/demo**. Click **Try the demo**, choose **The warehouse reply goes missing**, then **Shop this demo**. Northline has product details, a persistent bag, no-charge checkout, and an order-status page.

After purchase, click **See how Relay handled this order**. It opens that exact order's persisted result and audit trail—no copying an order number or searching the latest-ten list. The summary reports saved evidence rather than assuming the selected scenario succeeded.

Shop → demo checkout → durable order/job → simulated warehouse → Relay recovery. Payment/customer details are fictional, nothing ships, and warehouse acknowledgement is not delivery.

Production/fixture previews allow browsing but disable purchases and order-record reads. Keep enabled execution local. See [the guided demo](docs/GUIDED-DEMO.md) for the simplest walkthrough, evidence semantics, optional browser checks, and a recording outline. The [storefront guide](docs/STOREFRONT.md) describes checkout implementation.

## What to demonstrate

| Scenario                                  | Result                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Normal acceptance                         | One submission and an acknowledgement                        |
| Address rejection                         | Human review; no unchanged-input retry                       |
| Persistent warehouse outage               | Three total submissions, then human review                   |
| Acceptance followed by a delayed response | Original receipt recovered by GET lookup; no second POST     |
| Temporary outage                          | Two documented failures, then acceptance on submission three |
| Acceptance with unavailable lookup        | Three GET attempts, then review; still only one POST         |

Each run creates a synthetic paid order and pg-boss job **in the same database transaction**. Each recovery action is also committed atomically with its audit and queue job. The worker records claims before HTTP calls; restart/redelivery cannot authorize another submission without a valid, current retry action and documented provider contract.

**Three submissions total, three lookups total.** Submission retries wait 2s then 4s, plus up to 500ms jitter. Uncertain outcomes use read-only lookup instead. A minutely reconciliation scan and startup scan investigate interrupted claims and re-arm overdue recovery actions. Worker availability and polling affect actual timing; these are not response-time guarantees.

The latest ten runs show submission/lookup counts, current pending job, due time, review reason, and audit history. **Queue completion means a handler recorded an outcome—not that the warehouse accepted or fulfilled the order.** Infrastructure redelivery and authorized business retries remain separate concepts.

The UI polls while the lab is active. Closing the browser does not stop the worker. Refreshing results does not trigger another fulfillment request. A failed creation response retains its UUID and offers Retry same request, including across reloads when browser session storage is available.

## Read-only modes

For a standalone fixture preview without a database:

```bash
RELAY_DATA_SOURCE=fixtures npm run dev
```

For a production-mode read-only preview:

```bash
npm run build
npm start
```

**Production always disables the local lab API**, even if the demo opt-in is set. Fixture mode also disables execution. The `start` server binds to all interfaces for preview compatibility, but that is not permission to add real customer data: read APIs are still unauthenticated. Use only synthetic records.

Database mode never silently substitutes fixtures on failure. The page shows an explicit unavailable-data message and `/api/console` returns a redacted 503 response.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

- **65 unit tests**: fixtures, filtering, display, domain policy, configuration, origin guards, and bounded request parsing.
- **54 database/integration tests**: persistence, transactional rollback, duplicate/concurrent requests, all simulator outcomes, queue redelivery, bounded retries/lookups, stale delivery fencing, atomic recovery scheduling, and real worker stop/restart/SIGKILL cases.
- GitHub Actions is configured to run the same core checks with PostgreSQL. Check the actual Actions result after pushing; configuration is not proof a remote run succeeded.

**The integration suite truncates application/simulator tables and deletes queue jobs in its dedicated test database.** `TEST_DATABASE_URL` must point to a disposable loopback database whose name ends in `_test`, different from the application's database. Never use a database containing valuable data. Do not run multiple test suites against the same test database concurrently.

Compose creates `relay_ops_test` only when initializing a new data volume. If it is missing from an existing volume:

```bash
docker compose exec -T db psql -U relay -d postgres -c 'CREATE DATABASE relay_ops_test;'
```

If it exists, don't drop it. Dependency deprecation warnings in the pinned toolchain are distinct from failed checks; do not blindly apply `npm audit fix --force`.

## Architecture and stack

Next.js App Router, TypeScript, Tailwind CSS 4, Radix Dialog, Lucide, PostgreSQL 17, Drizzle, node-postgres, Zod, **pg-boss**, Vitest, Playwright, and tsx. Versions are locked in `package-lock.json`. System fonts avoid a runtime CDN dependency.

```text
src/app/          Server page, read API, guarded local-demo API
src/components/   Exception console and executable Demo lab
src/domain/       Pure, validated fulfillment state transitions
src/db/           Schema, migrations adapter, seed, reads, atomic state/audit writes
src/lab/          Local execution contracts, request policy, run creation/projection
src/store/        Catalog, strict cart pricing, purchase/status projection
src/demo/         Guided browser continuity and evidence-based result wording
src/queue/        pg-boss configuration and initialization
src/worker/       Durable claim and submission processing
src/recovery/     Bounded policy, transactional scheduling, lookup and scan handlers
src/simulator/    HTTP provider simulator and its connector
src/server/       Server-only database/queue boundaries
scripts/          CLI entry points and local environment configuration
drizzle/          Tracked application SQL migrations and snapshots
tests/            Disposable-database and worker-process integration tests
```

The worker communicates with the simulator over authenticated loopback HTTP. The browser calls only same-origin paths. Although the simulator shares the local PostgreSQL instance, the worker does not read simulator receipts to bypass the integration boundary.

## Boundaries and security

- One fictional store, paid demo orders, USD, one fulfillment intent/exception per order.
- Original seed examples retain their original snapshot timestamps. New runtime events advance observation time; older examples can show larger ages.
- A run is capped at three claimed submissions and three claimed lookups. Unknown outcomes never authorize a POST; even lookup “not found” escalates rather than blindly resubmitting.
- The local lab is capped at 100 total runs; its list displays the latest 10, while exact result links can read older lab runs. This is a demo bound, not a production rate limiter.
- Audit row updates/deletes are rejected by a PostgreSQL trigger, but privileged owners can bypass it. It is not a tamper-proof ledger.
- Request/queue deduplication and local concurrency checks are **not** a claim of exactly-once external execution.
- Host/Origin validation and development flags are local browser safeguards, not production authentication. Keep the enabled dev server on loopback.
- Never commit secrets, `.env`/`.env.local`, real customer records, or production payloads. Never prefix database credentials or simulator tokens with `NEXT_PUBLIC_`.
- `.env.example` contains intentionally public, local-only PostgreSQL credentials. Never reuse them in production.

## Operations

Ctrl+C each of the three processes separately. The worker attempts graceful shutdown. Persisted records/jobs survive process restarts.

```bash
npm run db:stop   # retains the named Docker volume
npm run db:up
```

**Do not use `docker compose down -v` unless you intend to delete the database volume.** There is no routine reset step in this patch workflow.

Use `db:generate` only when developing a new application schema migration. Review and commit generated SQL; don't edit previously applied migrations or replace tracked migration history with `drizzle-kit push`.

Read [the guided-demo guide](docs/GUIDED-DEMO.md), [the storefront guide](docs/STOREFRONT.md), [the execution guide](docs/EXECUTION.md), [the earlier persistence design](docs/PERSISTENCE.md), [the product brief](docs/PROJECT.md), and [the sequential patch workflow](docs/PATCH-WORKFLOW.md).

## License

No open-source license has been selected. A public repository is visible source, not an automatic grant of an open-source license.
