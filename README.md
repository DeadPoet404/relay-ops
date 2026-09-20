# Relay

### Order exception & recovery console

A monitoring and recovery layer between a Shopify store and its fulfillment provider. Relay answers: **which paid orders are not progressing toward fulfillment, why, and what is the safe next step?**

**Status: increment 001 — interface foundation.** This is not a production service. Northline Supply, the people, the orders, and every event shown are fictional. There is no live Shopify connection, warehouse API, job worker, authentication, or persistence. The fixed fixture snapshot is 20 September 2026 at 10:00 UTC. Nothing advances with wall-clock time.

## Run locally

Requires Node.js 22+ and npm. `.nvmrc` selects Node 22.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables, credentials, or database are needed for this increment. The dev server binds to all interfaces for preview compatibility; use `npm run dev -- --hostname 127.0.0.1` if you only want local access.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For a production-mode local preview: `npm start` after building. The build is not a claim of production readiness.

## Included now

- Responsive exception queue with deterministic, typed fixtures.
- Combined search, status filters, exception-type filters, and oldest/newest sorting.
- Order inspection with a safe-next-step explanation and audit timeline.
- Activity view derived from the same fixtures.
- Honest connection placeholders and a scenario-preview lab.
- Accessible dialog primitives: focus management, Escape dismissal, and labelled controls.
- Reduced-motion support, responsive navigation, and meaningful empty states.
- Unit tests for fixture integrity, filtering, and formatting.

Recovery controls are deliberately disabled. Scenario cards inspect fixtures; they do not execute workflows. Queue controls are temporary UI state and reset on reload.

## Stack

Currently installed: Next.js App Router, TypeScript, Tailwind CSS 4, Radix Dialog, Lucide icons, ESLint, Vitest. Versions are locked in `package-lock.json`. Fonts use a system stack: no runtime font CDN or external asset requests.

Planned when needed: PostgreSQL, Drizzle, Zod, pg-boss, and Playwright. We avoid installing future infrastructure before the increment that uses it.

## Layout

```text
src/app/                       Next.js entry points, metadata, visual tokens/styles
src/components/relay-console.tsx  Interactive foundation workspace
src/lib/demo-data.ts            Fixture types, records, and pure helpers
src/lib/demo-data.test.ts       Unit tests
docs/PROJECT.md                 Scope, architecture, safety rules, roadmap
docs/PATCH-WORKFLOW.md          Applying sequential patches safely
```

The console is intentionally one cohesive client component in this first patch. Feature boundaries will be extracted as routing and persistence arrive, without treating the demo fixture model as a production database design.

## Manual acceptance checks

1. The open queue shows 8 records, 3 needing review, 3 with a fixture retry state, and $1,104 in open order value. This value is not estimated loss or recovered revenue.
2. Search `Amara` or `#10482`, combine with a type filter, and reset an empty result.
3. Choose **Resolved** to inspect the 2 resolved examples.
4. Open order 10482. Verify that the next step calls for a status lookup, not blind resubmission.
5. Close the order with Escape. Focus should return to the invoking control.
6. Visit Activity, Connections, and Demo lab. No controls should imply that a backend is connected.
7. At a mobile width, open navigation and inspect an order. The page fits the viewport; the wide data table scrolls inside its panel.

## Security and public-repository hygiene

Do not commit `.env` files, credentials, real customer data, request logs, or copied production payloads. `.gitignore` excludes local secrets. Public source does not mean production-ready software. Authentication and server-side authorization must precede real data access; webhook verification and connector-specific recovery guarantees must precede live recovery.

## License

No open-source license has been selected yet. A public repository is visible source, not an automatic grant of an open-source license.
