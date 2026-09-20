# Relay

### Order exception & recovery console

A monitoring and recovery layer between a Shopify store and its fulfillment provider. Relay answers: **which paid orders are not progressing toward fulfillment, why, and what is the safe next step?**

**Status: increment 002 — persistence and domain foundation.** Northline Supply, its customers, orders, and warehouse responses are fictional. The interface now supports real PostgreSQL persistence for this fictional dataset. There is still no Shopify integration, warehouse API, job worker, authentication, or public recovery action.

## Start the persisted demo

Requires **Node.js 22+**, npm, and Docker with **Docker Compose v2**. `.nvmrc` selects Node 22. Run commands from the project root. If you already have a local PostgreSQL 17 installation, Docker is optional; configure equivalent application and test databases instead.

```bash
npm ci
test -f .env || cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. The banner should say **“PostgreSQL connected. Still a fictional store.”** The top badge reads **“Persisted demo.”** Restart Next.js after changing environment variables.

`.env.example` contains intentionally public, **local-only** development credentials. PostgreSQL is bound to loopback on port 5433 by Compose. Never reuse these credentials on a deployed database. `.env` and `.env.local` are ignored by Git; `.env.example` is tracked.

The seeder creates **10 orders, 10 fulfillment intents, 10 exceptions, and 37 audit events**. Rerunning `npm run db:seed` is a no-op for an existing compatible demo dataset: it never resets your records. Initial data is a fixed snapshot at 20 September 2026, 10:00 UTC, not a live clock or scheduled job.

## Standalone fixture preview

Without environment variables, the app defaults to fixture mode and needs no database. To select it explicitly even when `.env` exists:

```bash
RELAY_DATA_SOURCE=fixtures npm run dev
```

This is visibly labelled **“Fixture demo.”** Database mode never silently falls back to fixtures on an error. It shows a setup/error page instead; `/api/console` returns a redacted 503 response.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

- Unit suite: **24 tests**, no database required.
- PostgreSQL suite: **12 integration tests**, requires a dedicated local `TEST_DATABASE_URL` whose database name ends in `_test`. **It truncates the five Relay tables in that test database before every test. Never point it at a database with data you want to keep.** It refuses non-loopback hosts and a database name matching `DATABASE_URL`.
- GitHub Actions runs lint, types, both test suites, migrations, seeding, and a production build against a PostgreSQL service. The workflow is configuration until it has actually run successfully on your repository; check the Actions tab after pushing.

Compose creates `relay_ops_test` when initializing a **new** data volume. For an existing volume without it:

```bash
docker compose exec -T db psql -U relay -d postgres -c 'CREATE DATABASE relay_ops_test;'
```

If it already exists, don't recreate or delete it. See [the persistence guide](docs/PERSISTENCE.md) for troubleshooting.

## What works

- Responsive exception queue, combined search/type/status filtering, sorting, order inspection, and activity history.
- Typed, validated state-transition rules that distinguish an uncertain submission from an authorized retry.
- PostgreSQL schema, foreign keys, uniqueness and consistency checks, tracked Drizzle migrations.
- Repeatable-read, store-scoped data projection for the console.
- An internal transactional event service with row locking, expected-version checks, state/exception updates, and audit insertion.
- PostgreSQL triggers reject ordinary updates and deletes of audit events.
- A read-only, uncached `GET /api/console` endpoint serving the selected fictional dataset.
- Clear unavailable/empty/loading states; scenario cards inspect the loaded data rather than importing their own fixtures.
- Keyboard-focus restoration, accessible dialog primitives, responsive navigation, and reduced-motion support.

The state service is deliberately **not** exposed through HTTP or server actions. Structured evidence is validated, but its truth is the connector caller's responsibility. No job is scheduled and no external order is submitted by the service. A privileged database owner can still disable triggers or truncate tables; the audit trail is not a tamper-proof ledger.

## Current boundaries

- One fictional store, USD only, paid demonstration orders, one fulfillment intent and one exception per order.
- UI-only search/filter/navigation state resets on reload. Database records persist.
- Snapshot time represents the latest recorded observation, not elapsed wall-clock time. Seeded retries are examples, not jobs.
- Authentication, real eligibility decisions, webhook receipt/deduplication, partial fulfillment, recurring exception episodes, and job delivery belong to later increments.
- No pagination yet: the initial projection is sized for a small demo dataset.
- No claim of production readiness, exactly-once external execution, recovered revenue, or verified customer outcomes.

## Stack

Next.js App Router, TypeScript, Tailwind CSS 4, Radix Dialog, Lucide, PostgreSQL 17, Drizzle ORM/Kit, node-postgres, Zod, ESLint, Vitest, and tsx. Versions are locked in `package-lock.json`. Fonts use a system stack; no runtime font CDN is required.

pg-boss and the executable warehouse simulator arrive in increment 003. The worker will be a separate process, not an in-memory timer in Next.js.

## Project layout

```text
src/app/                 Server-rendered page, read API, loading/error UI
src/components/          Client-side console receiving a serializable data prop
src/domain/              Pure fulfillment rules and validation
src/db/                  Schema, connection factory, seed, reads, transactional writes
src/server/              Server-only configuration/pool boundary
src/lib/                 Shared presentation contracts and standalone fixtures
scripts/                 Environment loading, migration and seed commands
drizzle/                 Committed SQL migrations and schema snapshots
tests/                   PostgreSQL integration tests
.github/workflows/ci.yml Repeatable repository checks
```

## Operations

```bash
npm run db:stop   # Stop PostgreSQL, retaining its named volume
npm run db:up     # Start it again
```

`docker compose down` also retains the named volume unless told otherwise. **Do not use `docker compose down -v` unless you intend to permanently delete the local database volume.** There is no routine reset command in this increment.

Use `npm run db:generate` only when changing the schema. Review and commit generated SQL before running `npm run db:migrate`. Do not edit a migration after it has been shared/applied, and don't replace tracked migrations with `drizzle-kit push`.

The dev server binds to all interfaces for preview compatibility. For local-only UI access, run `npm run dev -- --hostname 127.0.0.1`.

## Security and public-repository hygiene

Do not commit real customer data, request logs, credentials, or copied production payloads. Never expose `DATABASE_URL` through a `NEXT_PUBLIC_` variable. Do not put real data into this unauthenticated demonstration or publicly deploy database mode before adding authentication and store-level authorization. The synthetic-only fixture preview can remain publicly demonstrable.

Read [the product brief](docs/PROJECT.md), [the persistence design](docs/PERSISTENCE.md), and [the patch workflow](docs/PATCH-WORKFLOW.md).

## License

No open-source license has been selected. A public repository is visible source, not an automatic grant of an open-source license.
