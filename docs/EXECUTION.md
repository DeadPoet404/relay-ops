# Increment 003 — executable local lab

## What is now real

A local demonstration can create a synthetic paid order, atomically queue its submission, process it in a separate worker, call a warehouse simulator over HTTP, and record the outcome in PostgreSQL.

This is **not** a Shopify integration or live fulfillment service. The simulator is a real local HTTP service whose business responses and stored receipts are fictional. It shares a development PostgreSQL instance for convenience, but the worker does not read the simulator's receipts to infer outcomes.

```text
Local browser (loopback development server)
  POST /api/lab { requestId, scenario }
      |
      +-- same-origin + explicit development opt-in + input validation
      |
      +-- one database transaction:
      |     order + fulfillment intent + lab run + audit event
      |     pg-boss job insert using fromDrizzle(tx, sql)
      |
      v
relay_jobs schema / relay-demo-submit queue
      |
Separate worker process
      |
      +-- per-run session advisory lock
      +-- commit submission claim and one attempt BEFORE network I/O
      |
      v
Authenticated HTTP call to loopback warehouse simulator
      |
      +-- simulator stores successful reference uniquely before replying
      |
      v
Worker commits outcome + exception (if needed) + audit + attempt result
      |
      v
Demo lab polls persisted results; exception queue receives updated data
```

## Four scenarios

| Scenario                | Simulator behaviour                               | Relay outcome                                               |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Normal acceptance       | Stores one receipt and acknowledges its reference | Acknowledged; no new exception                              |
| Address rejected        | Returns a documented 422 rejection                | Needs review; no business retry                             |
| Warehouse unavailable   | Returns a documented 503 response                 | Visible unavailable/review exception; no business retry     |
| Accepted, response lost | Stores a receipt, delays response 3.5 seconds     | Worker times out after 1.5 seconds; outcome remains unknown |

The connector checks the returned reference and response shape. It does not treat arbitrary 422/503 responses as the documented simulator responses. Transport errors, unexpected responses, mismatched acknowledgements, and malformed payloads all remain unknown. No automatic HTTP retry is hidden inside the connector.

An accepted-but-timed-out order has a real simulator receipt, but Relay has no acknowledged warehouse reference. That discrepancy is the point of the scenario. Reference lookup and reconciliation come in increment 004.

## The important durability boundaries

### Order and queue job are one transaction

`createRun` sends the pg-boss insert through its Drizzle transaction using pg-boss's supported adapter. A test throws after the queue insert and verifies that neither the job nor the order survives rollback. This avoids the gap between committing an order and separately enqueueing it.

The caller supplies a UUID request ID. Reusing that ID with the same scenario returns the existing run; using it with a different scenario returns 409. Concurrent duplicate requests produce one order and one job. The UI retains an unconfirmed request ID and offers **Retry same request** after a lost response. It also retains that ID in session storage across tab reload/navigation when storage is available. This is bounded request deduplication, not a universal exactly-once guarantee.

### Queue redelivery is not permission to resubmit

A durable claim and attempt are committed before HTTP submission. If the worker restarts and finds that claim without a recorded outcome, it marks the order unknown and makes **no new warehouse request**.

This deliberately includes the ambiguous case where a worker might have died before actually sending the request. Without evidence, it is safer to surface uncertainty than risk two fulfillments.

A session advisory lock serializes concurrent handlers for the same run. Terminal runs are no-ops on duplicate delivery. The simulator also has a durable unique-reference constraint and rejects a changed payload for an already-accepted reference.

### Infrastructure retries are distinct from business retries

pg-boss allows up to 3 redeliveries for worker/infrastructure failures, with a 2-second delay. The default active-job lease is 20 seconds; supervision runs every 5 seconds. A genuinely killed process may therefore take several tens of seconds to be redelivered after restarting the worker.

Address rejection, documented unavailability, and uncertain submission outcomes are recorded business outcomes. Their queue jobs complete after the outcome is persisted. **Queue state `completed` does not mean the warehouse fulfilled or even accepted the order.** Read the run outcome and audit trail.

Queue errors exhausting delivery attempts are shown as `failed` in the lab when the retained job record is available. A stale running/queued application record can remain after infrastructure exhaustion; there is no automatic replay button yet. Completed queue records are retained for 24 hours, pending ones for 7 days. Application runs and audit events have no automatic deletion in this increment. `not retained` is not a successful outcome.

The tests launch actual worker subprocesses. One test stops/restarts a worker around queued work. Another uses SIGKILL after the simulator has accepted a submission, uses a shortened test-only lease, restarts the worker, and verifies one receipt and no second claimed attempt.

## Local-only execution boundary

Production builds **always** disable `/api/lab`, even if the opt-in flag is set. Fixture mode also disables it. Development requires all of:

- `NODE_ENV=development` (set by Next.js dev).
- `RELAY_DATA_SOURCE=database`.
- `RELAY_ENABLE_DEMO_RUNS=true`.
- Exact configured loopback Host/Origin; mutation requests require Origin.
- Compatible browser fetch-site metadata, JSON content type, a bounded 4 KiB body, and a strictly validated UUID/scenario payload.

These are local-development and browser-CSRF safeguards, **not production authentication**. The web server must bind to loopback; both `npm run dev` and `npm run demo:dev` now do so by default. Do not override the bind address or proxy the enabled lab to a public host. A local process capable of spoofing HTTP headers is not treated as an untrusted authenticated user by this development setup.

The simulator binds to `127.0.0.1` and requires a generated bearer token. Its token and base URL are server-side only, never `NEXT_PUBLIC_` values. The worker uses the simulator URL directly; the user's browser uses only same-origin API paths. The worker and simulator refuse production mode or a missing opt-in. Defaults use `http://127.0.0.1:4010`; keep that address unless deliberately reconfiguring the local port.

The producer is capped at 100 total local lab runs to bound the demonstration dataset. It is not production-grade rate limiting. Do not drop a database containing evidence just to bypass that cap.

## Upgrade and setup

Use Node.js **22.12 or newer**; the pinned pg-boss release requires it. The latest Node 22 via `.nvmrc` is suitable.

Stop an existing Next.js dev process before applying the patch/installing dependencies. Existing PostgreSQL data is retained: the application migration adds three tables and two enums. pg-boss manages its own separate `relay_jobs` schema through `queue:init`. Do not edit previously applied migrations.

```bash
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run queue:init
npm run demo:configure
```

`demo:configure` writes only managed local-demo settings into the ignored `.env.local`, preserving unrelated entries and retaining an existing suitable simulator token. It enables database mode locally. It does not overwrite database credentials or print its secret. `.env.local` takes precedence over `.env`; already-exported shell variables still take precedence over both. Restart all processes after changing settings.

Open three terminals, each in the project root:

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

Open **http://localhost:3000** exactly (the default configured origin). The CLI may print `127.0.0.1`; that is the binding address, but it is not the configured browser origin. If you intentionally choose another origin/port, update `RELAY_DEMO_ORIGIN` in `.env.local` and restart Next.js. Do not remove the origin checks to work around a mismatch.

## Demonstration flow

1. Open Demo lab and run **An order, acknowledged**. Expect Acknowledged and one warehouse reference.
2. Run the rejected-address and unavailable scenarios. Expect new exceptions, not automatic warehouse retries.
3. Run **Accepted. But no answer**. Expect Outcome unknown, one claimed attempt, and no acknowledged warehouse reference.
4. Expand a run to inspect its queue state and event trail. Recent runs shows the latest 10.
5. Visit Exceptions. The new failure records are present alongside the preserved seed examples.
6. Stop only the worker. Create another demo run. It should stay Queued.
7. Restart the worker. The persisted run should be processed without recreating it.

The UI polls while the lab is visible, stops polling on unmount/hidden tabs, and labels failed reads as potentially stale. Read time is not a worker-health indicator. Filters/navigation remain client state. Original seed examples retain their original timestamps; newer worker events advance the data observation time, so old examples can have larger displayed ages.

For the provider side of the timeout scenario, you may inspect **local synthetic receipts only**:

```bash
docker compose exec -T db psql -U relay -d relay_ops -c \
  "SELECT reference, warehouse_reference, accepted_at FROM simulator_receipts ORDER BY accepted_at DESC LIMIT 10;"
```

This inspection is diagnostic evidence, not an implementation of reconciliation. The worker does not use this table as a back door.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Expected: 33 unit tests and 24 PostgreSQL/integration tests. The database suite now also creates/deletes jobs, clears the new Relay and simulator tables, and launches short-lived local worker processes. It only runs against the explicitly supplied, disposable, loopback `_test` database. Never point it at valuable data. Don't run multiple copies of the database suite against the same test database.

The initial 12 persistence tests remain; 12 execution tests cover transactional enqueue, duplicate request identity, all four outcomes, duplicate/concurrent delivery, interrupted claims, simulator authentication/idempotency, queued restart, and actual killed-worker recovery. GitHub Actions is configured to run these checks; inspect the remote run after pushing rather than assuming it passed.

## Stopping and failure diagnosis

Ctrl+C each process independently. The worker attempts graceful shutdown and waits for its current submission. Stopping a process does not delete jobs, receipts, or application records. `npm run db:stop` retains the Docker volume. Never use `docker compose down -v` as a routine patch step.

- **Execution disabled:** use development mode, run `demo:configure`, and restart Next.js. `npm start` is deliberately read-only.
- **Lab API 403:** use the exact configured localhost origin. Check flags; do not disable validation.
- **Lab unavailable / 503:** confirm PostgreSQL, migrations, seed, and `queue:init` succeeded.
- **Run stays queued:** inspect the worker terminal. A queued row proves persistence, not worker liveness.
- **Unexpected outcome unknown:** inspect simulator availability and matching server-only token; a connection failure is deliberately not treated as safe-to-resubmit.
- **Worker fails to start after an upgrade:** check Node version (22.12+), queue installation, and environment variables. Do not reset its database.
- **Pending request after a browser error:** use Retry same request; it reuses the UUID even if the original response was lost after commit.
- **State updates appear stale:** use Refresh and inspect any read-error notice; background jobs do not depend on polling.

## Still deferred

No real Shopify events, actual payments, actual shipment creation, automatic business retry policy, automatic reconciliation, manual address correction, refund/cancellation actions, or production authentication. Those remain deliberate boundaries rather than hidden TODOs in a supposedly complete product.
