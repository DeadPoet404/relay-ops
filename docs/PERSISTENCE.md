# Increment 002 — persistence and state model

> Historical design notes for Patch 002. Patch 003 adds a guarded local-demo write endpoint, worker, queue, and simulator; current commands, test counts, and boundaries are documented in [EXECUTION.md](EXECUTION.md) and the README.

## What changed

Increment 001 bundled presentation fixtures inside the console. Increment 002 makes the console a consumer of a serializable `ConsoleData` prop. A server-only boundary selects either the explicit standalone fixture adapter or a PostgreSQL repository. All counts, scenario previews, details, and activity use that same selected dataset.

```text
RELAY_DATA_SOURCE=fixtures -> fixture adapter ---+
                                                +--> ConsoleData --> UI
RELAY_DATA_SOURCE=database -> PostgreSQL read ----+
                                   |
                         repeatable-read transaction
                                   |
              store -> orders -> fulfillment intents -> exceptions
                                         |
                                     audit events
```

The home page and `GET /api/console` use the same service. Both are dynamic; the API sends `Cache-Control: no-store`. The browser never receives a connection string. API write methods return 405. The API is intentionally unauthenticated and serves only synthetic data in this local development increment.

If the source configuration is invalid, the database cannot be reached, migrations are missing, or the demo store is not seeded, database mode does **not** show a fixture fallback or a misleading zero-exception queue. It presents a clear setup/error state. Detailed driver errors and credentials are not returned to the browser.

## Database entities

| Table                 | Role                                                                     | Important constraints                                                                  |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `stores`              | Demo workspace, dataset version, observation timestamp                   | Unique slug                                                                            |
| `orders`              | Customer/order facts, USD amount in integer minor units                  | Unique `(store_id, source_order_id)`, positive item count, nonnegative amount          |
| `fulfillment_intents` | Durable submission reference, state, warehouse reference, version        | One per order, unique external reference, acknowledgement requires warehouse reference |
| `exceptions`          | Failure classification and work-queue status                             | One per intent, resolved timestamp required only for resolved state                    |
| `audit_events`        | Actor, event type, human-readable evidence, sequence and occurrence time | Unique intent/sequence; ordinary updates/deletes rejected by a trigger                 |

The initial domain deliberately supports a paid, USD-only demo. It is not a full payment ledger or a real fulfillment eligibility implementation. These database restrictions must be changed deliberately before supporting other payment states or currencies.

A fulfillment state is not the same thing as a queue status. For example, `acknowledgement_unknown` maps to `investigating`; `acknowledged` maps to `resolved`. An unknown outcome may be escalated to `needs_review` without falsely claiming the warehouse rejected it.

The read repository checks this state/status consistency; it refuses to display internally contradictory rows. Foreign keys and local row invariants are enforced in SQL; cross-table consistency is maintained by the transactional service, not by an all-purpose database trigger.

## State transitions

| Event                  | Permitted source states                            | Result                  |
| ---------------------- | -------------------------------------------------- | ----------------------- |
| `submission_started`   | awaiting submission, retry scheduled               | submitting              |
| `submission_timed_out` | submitting                                         | acknowledgement unknown |
| `address_rejected`     | submitting                                         | needs review            |
| `retry_authorized`     | submitting, acknowledgement unknown                | retry scheduled         |
| `acceptance_confirmed` | submitting, unknown, retry scheduled, needs review | acknowledged            |
| `review_required`      | submitting, unknown, retry scheduled               | needs review            |

Retry authorization needs structured evidence with the same external reference and a stated basis: provider idempotency or confirmed nonacceptance. Confirmation needs a warehouse reference and matching evidence. Acknowledged fulfillment cannot be reopened or resubmitted in this increment. Correcting an invalid address is deliberately not modeled as an automatic retry; that operator workflow arrives later.

**These checks validate the shape and consistency of evidence, not its truth.** A future connector must establish provider idempotency guarantees or a definitive lookup result. A transient status code or an eventually consistent “not found” response is not automatically definitive nonacceptance. No untrusted browser input may be treated as evidence.

## Transactional event service

`applyFulfillmentEvent` is internal only; no route or server action invokes it in this increment.

It:

1. Validates store, intent, expected version, timestamp, actor, and event.
2. Locks the selected intent row while verifying it belongs to the specified store.
3. Rejects stale versions and older transition timestamps.
4. Computes the next state using the pure domain function.
5. Updates the intent and its exception state in the same transaction.
6. Inserts the next audit sequence number under the same row lock.
7. Advances the store's recorded observation timestamp if appropriate.
8. Commits all records together, or rolls them all back on error.

A test forces audit insertion to fail after the intent/exception writes and checks that neither write survives. A concurrent test applies the same expected version twice and verifies exactly one commit and one version conflict. This is an internal write-concurrency property, **not** a guarantee of exactly-once effects at a warehouse.

The service does not submit orders, schedule jobs, deduplicate provider webhook IDs, reconcile older events, or authenticate actors. The later ingestion/worker boundary must supply those guarantees. Current actor strings are trusted internal test/service identifiers.

Audit evidence is rendered as text, not raw provider JSON. Do not include credentials or unnecessary PII in event descriptions. PostgreSQL's trigger prevents ordinary row edits, but a database owner can bypass it; production will need a least-privilege application role, retention rules, backups, and other operational controls.

## Seeding and timestamps

`db:seed` imports the increment-001 examples into the normalized schema as an explicit initial snapshot, not as a claim that events were processed live. It uses a transaction and an advisory lock to avoid partial or competing initial seeds.

- First run inserts the complete dataset.
- Later compatible runs leave every record untouched.
- An incompatible dataset version is rejected, not overwritten.
- There is no automatic repair of manually deleted/corrupted records.

At the initial snapshot, 8 exceptions are open, 3 need review, 3 have an example retry state, 2 are resolved, and open order value is $1,104. Amounts with cents display without rounding away the cents.

The interface shows **time relative to the stored observation snapshot**, not the current clock. Refreshing the page does not pretend new jobs ran. The state service advances observation time only when a later event is recorded.

## Local setup

```bash
node --version                  # 22 or newer
```

Check Docker with:

```bash
docker --version
docker compose version
docker info
```

If Docker is missing, unsupported, or inaccessible, stop and resolve that first. Do not run `sudo npm ci` or change ownership of your project as a workaround. Adding a user to the Docker group has security implications (Docker access is effectively root-level); choose an appropriate Docker installation rather than blindly changing permissions.

From the repository root:

```bash
npm ci
test -f .env || cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

An existing `.env` is preserved. Ensure it defines `RELAY_DATA_SOURCE=database`, `DATABASE_URL`, and matching Compose credentials. Scripts load `.env.local` before `.env`, respecting already-exported variables, consistent with the relevant Next.js local precedence. Do not post either environment file publicly.

Compose initializes both `relay_ops` and `relay_ops_test` only for a brand-new database volume. If using native PostgreSQL, create equivalent databases and a role, then adjust both URLs. The application role needs schema-creation permission to run migrations in this local setup.

## Database integration tests

```bash
npm run test:db
```

**This command truncates Relay tables inside its dedicated test database.** Never supply a database containing valuable data, even if its name happens to end in `_test`. Tests require a loopback PostgreSQL URL, a `_test` database suffix, and a database name different from the application's. These guards reduce accidental misuse; they cannot determine the actual importance of your data.

The suite applies tracked migrations itself. It does not clear the application's `relay_ops` database. Don't run multiple instances of the database suite against the same test database concurrently.

To create the test database in an already-initialized Compose volume:

```bash
docker compose exec -T db psql -U relay -d postgres -c 'CREATE DATABASE relay_ops_test;'
```

A database-already-exists response is not a reason to drop it.

## Manual acceptance checks

1. Confirm the banner says PostgreSQL is connected and the badge says Persisted demo.
2. Open `http://localhost:3000/api/console`: `source` should be `database`.
3. Rerun `npm run db:seed`; it must report no overwritten records.
4. Run `npm run db:stop`, refresh the page, and observe an unavailable-data message—not fixtures. The API should return 503.
5. Run `npm run db:up` and refresh; the same records return.
6. Start with `RELAY_DATA_SOURCE=fixtures npm run dev` to explicitly choose the standalone preview. The source badge must change.
7. Run unit tests, database tests, and production build.

## Troubleshooting

- **Docker permission/daemon error:** resolve Docker availability before continuing. Do not edit the source or regenerate the patch.
- **Port 5433 occupied:** choose another `POSTGRES_PORT` in `.env` and change both database URLs to match; restart Compose and Next.js.
- **Authentication fails after changing `.env`:** PostgreSQL initialization settings only apply to a new volume. Editing a password in `.env` does not change the password stored in an existing database. Do not delete the volume to work around this without considering its contents.
- **Page still says Fixture demo:** check `RELAY_DATA_SOURCE`, exported variables, and `.env.local`; restart Next.js.
- **Dataset unavailable:** check `docker compose ps`, migration success, seed success, and database URL. Share command errors, not secrets.
- **Pending schema changes:** use `db:generate` when developing a new migration, not during routine setup. The patch already includes reviewed SQL and Drizzle metadata.
- **GitHub rejects a workflow-file push:** authorize the additional scope with `gh auth refresh -h github.com -s workflow`, then retry `git push origin main`.

## Deferred work

Increment 003 adds the executable warehouse simulator and separate pg-boss worker. Before connecting any real store, we must add authentication and store-level authorization, raw-body webhook verification, durable event identities, eligibility checks, secret handling, monitoring, and connector-specific recovery guarantees.
