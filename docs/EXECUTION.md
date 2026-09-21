# Increment 004 — safe recovery and reconciliation

> Recovery architecture remains current. Increment 005 adds a connected storefront and raises the suite to 49 unit / 49 integration tests. See [STOREFRONT.md](STOREFRONT.md) for the current presentation and upgrade guide.

Relay is a **local synthetic execution lab**, not a live commerce integration. A paid fictional order goes through a durable submission claim, authenticated HTTP simulator, recorded evidence, and—where permitted—a durable recovery action. There is no real Shopify connection, shipment, refund, cancellation, or production write access.

## What the six scenarios prove

| Lab card                      | Provider behavior                                  | Eventual result                                    |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| An order, acknowledged.       | POST accepts normally                              | Acknowledged; 1 submission, 0 lookups              |
| An address needs a person.    | POST rejects address                               | Needs review; 1 submission, no retry               |
| The warehouse is unavailable. | Every POST returns documented retry-safe 503       | Needs review after 3 total submissions             |
| Accepted. But no answer.      | Receipt committed before delayed POST response     | GET finds original receipt; 1 submission, 1 lookup |
| Back online on attempt three. | First 2 POSTs return documented 503; third accepts | Acknowledged; 3 submissions, same reference        |
| No reliable answer yet.       | Receipt committed; POST times out; GET unavailable | Needs review after 3 lookups; 1 submission         |

The unresolved state may be brief: the UI polls every few seconds and can first display the completed recovery. Expand a run to inspect the audit trail and durable counts. These are simulator results, not evidence of production reliability or saved revenue.

## Recovery policy

### Confirmed temporary failure

A generic 503 is **not** permission to retry. The local connector requires an authenticated, reference-matching response declaring `retrySafe: true` and `idempotency: "reference-v1"`. Unexpected, malformed, mismatched, network, and timeout results remain unknown.

At most **3 submissions total**, including the initial attempt. Retry delays are 2s and 4s plus 0–500ms jitter. The policy function caps exponential delay at 10s before jitter; the three-submission budget stops this flow before that cap. Retry claims reuse the original reference and immutable demo-order payload. The simulator serializes requests by reference, records their payload fingerprint and POST count, rejects changed payloads, and keeps a unique receipt.

### Unknown outcome

Unknown submissions never authorize another POST. The worker schedules an authenticated GET of the **original reference** after 3s:

- Matching positive evidence confirms acceptance and resolves the exception.
- A valid matching 404 escalates: “not found” does not exclude an in-flight or late-accepted request.
- Unavailable or invalid lookup evidence permits another GET, within a **3-lookup total** budget; subsequent delays are 2s and 4s plus jitter.
- Exhaustion stops automation and leaves a visible review reason. Budgets are not reset by reloads, worker restarts, scanner ticks, or operator clicks.

Counts represent durable claims made **before** HTTP. A crash before sending may consume a claim without an actual request; the UI deliberately counts the conservative claim rather than inventing knowledge of external execution.

An address rejection stops at human review. Corrected-address submission is not implemented. There is no force-submit or force-retry endpoint.

### Periodic reconciliation

The worker runs a persisted minutely pg-boss schedule and requests a startup scan. The scan is bounded to 100 lab runs; it does not process the original seeded examples or real store orders.

- Interrupted `running` claims older than 30s become unknown and get a lookup.
- A pending recovery action overdue by more than 30s is re-armed with a **new delivery ID**. Old callbacks cannot claim it.
- Historical unresolved Patch 003 runs with no pending action get lookup only. Old unavailable outcomes are not retroactively given business retry permission.
- Escalated runs are not re-armed. No budget is reset.

The per-run lock protects active HTTP operations from the scanner. The minute interval is a backstop cadence, not a hard 60-second completion SLA: workers must be available and queue/database delays also apply. Initially queued work relies on the durable submission queue and infrastructure redelivery; the scanner does not blindly replay an exhausted initial job.

## Durable boundaries

### Atomic state, audit, and queue insertion

Initial run creation inserts the order and pg-boss job in one Drizzle transaction. Recovery scheduling similarly commits pending action, action UUID, due time, audit event, and pg-boss job together through the supported transaction adapter. Tests force enqueue failure and check rollback.

Creation uses a caller-supplied UUID. The same ID/scenario returns the existing run; a different scenario conflicts. The UI retains an unconfirmed UUID and offers **Retry same request**, including across reloads when session storage is available. This retries creation of the same run, not warehouse submission.

### Claims and delivery fencing

A session advisory lock serializes handlers for each run across the claim, HTTP call, and outcome write. Database row locks serialize state/audit updates. A retry requires the current action UUID, due time, prior documented unavailable result, retry-authorized domain state, and remaining budget. Each attempt has a unique job ID and `(run, attempt number)`.

Duplicate terminal callbacks do nothing. An interrupted delivery can affect only its own latest claim; an old original job cannot interrupt a newer retry. An interrupted claim authorizes lookup, not another POST. The simulator uses a separate provider-side reference lock.

These checks are **not a universal exactly-once external execution guarantee**. The current reference/idempotency contract belongs to the local simulator. Any real connector must establish its own documented guarantees and eligibility rules.

### Infrastructure versus business retry

pg-boss allows up to 3 redeliveries for infrastructure failures with a 2s delay. Active-job expiry is 20s and supervision runs every 5s. Business outcomes are recorded and their jobs complete; **queue completion does not mean fulfillment or warehouse acceptance**.

Completed jobs are retained for 24 hours and pending jobs for 7 days. Application runs/audit records are not automatically deleted. `not retained` is not success. The lab shows the initial submission queue state separately from the currently pending recovery job; the audit preserves previous actions after pending metadata is cleared.

## Local-only API and simulator boundary

`/api/lab` and POST `/api/lab/reconcile` are disabled in production and fixture mode, even with an opt-in flag. Development execution requires:

- `NODE_ENV=development`, database mode, and `RELAY_ENABLE_DEMO_RUNS=true`.
- Exact configured loopback Host/Origin; mutations require Origin.
- Compatible fetch-site metadata, JSON, a bounded 4 KiB body, and strict payload validation.

`POST /api/lab/reconcile` accepts only `{ "runId": "<UUID>" }`. It coalesces a permitted **read-only lookup** for a demo-store run. It cannot reset budgets, modify an address, or override review. Concurrent active work can return 409; it is not permission to submit again. The UI offers Check warehouse only where such a lookup may be requested; automatic recovery normally means there is already a pending action.

These checks are **local development / CSRF safeguards, not authentication**. Keep the enabled lab bound to loopback. Do not expose it with a public proxy. A local process capable of spoofing headers is outside this development threat model.

The simulator binds to `127.0.0.1`, requires a server-only bearer token, and uses PostgreSQL for receipts/request identity. The worker uses authenticated HTTP GET/POST; it never reads simulator tables as a back door. Redirects are rejected. The browser uses only same-origin API paths. Worker/simulator refuse production mode or missing opt-in.

The lab is capped at 100 runs and shows the latest 10. This is not production rate limiting; do not delete evidence to bypass it.

## Upgrade from 003 (preserve data)

Use Node **22.12+**. Stop the web app, worker, and simulator before applying 004. Do not mix old workers/simulators with the new schema. Keep PostgreSQL running.

After `git am`:

```bash
npm ci
npm run db:migrate
npm run queue:init
```

Migration `0002_safe_recovery.sql` preserves existing rows and audit history. It adds recovery fields and a simulator request ledger, expands scenarios, and backfills old attempts as number 1 with their original run ID as job ID. The new ledger counts requests handled by the new simulator; it does not reconstruct historical POST traffic. No reset or reseed is needed. Do not edit old migrations or use `drizzle-kit push`.

Existing `.env` / `.env.local` settings and token still work. Only run `npm run demo:configure` if local execution has not been configured. It retains suitable tokens and unrelated settings without printing secrets. Exported shell variables override `.env.local`, which overrides `.env`.

For a fresh installation, use the full README setup (database, migrations, seed, queues, local configuration).

Start three terminals from the project root:

```bash
# Terminal 1
npm run simulator
```

```bash
# Terminal 2
npm run worker
```

```bash
# Terminal 3
npm run demo:dev
```

Open **http://localhost:3000** exactly. The CLI binding address `127.0.0.1` is not the default configured browser origin. Deliberate origin changes require updating `RELAY_DEMO_ORIGIN` and restarting Next.js—not removing validation.

## Demonstration and verification

1. Run **Accepted. But no answer.** Expect Acknowledged, 1/3 submissions, 1/3 lookups, and **Original fulfillment recovered** in the audit.
2. Run **Back online on attempt three.** Expect two scheduled retries, then acknowledgement with 3/3 submissions.
3. Run the persistent outage and failed-lookup cases. Each stops at its respective budget with a review reason.
4. Run the address case. It must not schedule an unchanged-input retry.
5. Stop the worker, create a run, and restart. Queued work survives. Existing recovery due times also survive restarts.
6. Inspect Exceptions and recent-run audit history. Recovered exceptions are resolved; unresolved ones remain visible.

Polling stops on hidden/unmounted lab views. Failed reads are labelled potentially stale. Browser refresh does not drive background recovery. Original seed timestamps are preserved; new events advance observation time, so old examples can display larger ages.

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Expected: **38 unit tests and 39 PostgreSQL/integration tests**. The suite covers 12 persistence cases, 13 execution cases, and 14 recovery cases: transactional enqueue, six provider paths, retry/lookup budgets, stale and concurrent delivery, interrupted newer claims, operator coalescing, scan repair, rollback, SQL bounds, and the persisted cron schedule. Actual worker subprocess tests exercise queued restart, SIGKILL after acceptance, and persisted delayed retries across restart. Most isolated policy tests accelerate due timestamps; the worker-restart test and browser checks use real delays.

**Database tests truncate the dedicated test database's application/simulator tables and delete queue jobs.** Require a disposable loopback `_test` database different from the app database. Do not run concurrent test suites against it. GitHub Actions is configured to run core checks; inspect the actual remote result after pushing.

## Operations and diagnosis

Ctrl+C each process separately. The worker attempts to finish active jobs. Records/jobs survive restart; `npm run db:stop` retains the Docker volume. Never use `docker compose down -v` as a patch step.

- **403 / execution disabled:** use development mode and the exact origin; check flags and restart. Production is deliberately read-only.
- **503 / lab unavailable:** check PostgreSQL, migrations, queue installation, and worker logs. Do not reset the database.
- **Queued / scheduled remains unchanged:** inspect worker availability and displayed due time. A persisted job is not proof a worker is running.
- **Unknown then review:** inspect simulator availability and matching server-only token. Network failure is not safe-to-resubmit evidence.
- **Budgets exhausted / not found:** automation deliberately stopped. No implemented correction/override workflow exists.
- **Historical 003 records change on startup:** unresolved lab runs are being checked by GET. Seed-only examples remain inert.
- **Initial creation response lost:** Retry same request retains the UUID; do not create a different run to “retry” the same order.
- **Node/queue startup error:** use Node 22.12+, run migration and queue initialization, then restart all processes.

## Still deferred

Real Shopify ingestion and eligibility, authenticated/authorized operators, corrected-address actions, arbitrary-provider recovery guarantees, webhook ordering/missed-event ingestion, production deployment/monitoring, refunds, cancellations, and actual shipment creation. Read-only production previews remain synthetic and unauthenticated.
