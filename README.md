# Relay — Order Recovery Console

**Orders don't get lost. They get stuck.**

Relay is a safe recovery console for the space between payment and fulfillment. It shows which orders are stuck, what evidence we have, and what is safe to do next — so you never blind-resubmit and never silently duplicate.

Built as a flagship portfolio piece for agency work. Next.js + Tailwind, PostgreSQL + pg-boss, fictional store with real durable execution.

> **Live demo flow:** `/` landing → `/demo` choose a problem → `/store` shop Northline → checkout → watch real system work (6s queue + 2s handoff) → live journey widget follows you → `/store/orders/[id]` + `/runs/[id]` evidence.

---

## What this demonstrates

**The problem:** Payment succeeds, fulfillment doesn't know. Three ways orders get stuck:
- **A request without an answer** — warehouse times out. Did it accept? Check original via lookup before retry.
- **An address that needs a person** — shipping address rejected. Ask for correction, not same invalid input.
- **A warehouse taking a moment** — temporary outage. Bounded retry with evidence.

**The solution:**
- **3 submissions total, 3 lookups total** — retries wait 2s then 4s + jitter. Uncertain outcomes use read-only GET, never blind POST.
- **Same DB transaction** — order + job saved atomically. Recovery action + audit + queue job also atomic.
- **Claims before HTTP** — worker records claim before warehouse call. Crash during pause → interrupted → lookup, never duplicate.
- **Evidence, not assumptions** — every attempt, lookup, decision audited with time, reference, outcome.

**Fictional data only:** No Shopify, no real shipments, no PII, no production auth, no address correction, no force submission. All customers, orders, warehouse records are synthetic.

---

## Portfolio landing

`/` is now a static case-study landing (not the console):
- Hero with live card preview (Order recorded → Submission → Checking → Confirmed)
- Problem 3 cards, Solution bullets + architecture diagram
- Live demo 4 steps + cards to guided demo, Northline, console
- Stack + footer

`/console` hosts the ops console (dynamic, requires DB).

---

## Architecture

```
Storefront (Next.js · bag · checkout)
  → PostgreSQL (order + job same TX)
  → pg-boss queue (startAfter 6s · retry 2s)
  → Worker (claim before HTTP · 2s handoff)
  → Simulator (4010 · controlled failures)
  → Minutely reconciliation + startup scan re-arms overdue
```

- **DB:** PostgreSQL 17, Drizzle migrations under `drizzle/`, pg-boss manages `relay_jobs` schema
- **Queue:** `queue:init` installs submission, recovery, reconciliation queues
- **Simulator:** `npm run simulator` on 127.0.0.1:4010, token in `.env.local`
- **Worker:** `npm run worker` — durable consumer, records claims before HTTP
- **Web:** `npm run demo:dev` — loopback 3000, `RELAY_DEMO_ORIGIN` must match

Warehouse ack ≠ packing/shipment. Pacing is presentation (6s queue + 2s handoff) — policy unchanged.

---

## Guided demo

1. Choose a problem at `/demo/start` — recommended **The warehouse reply goes missing**
2. Shop Northline, add to bag — system activity widget shows `Bag updated · N items` instantly (calm, no chaotic bounce)
3. Place demo order — checkout shows `Validating bag…` 420ms → `Reserving order + queue job…` 380ms → guided execution flow with 4 stages (420/780/720/420ms fixed, no jitter, no repetitive glitch)
4. Watch live journey widget bottom-right follow you: store → order → evidence, same UUID everywhere
5. Open exact evidence via `See how Relay handled this order`

`docs/GUIDED-DEMO.md` has full walkthrough, evidence semantics, browser checks, recording outline.

---

## Console UI — flagship polish (013)

- **Metric cards:** 12px radius, stagger entrance, hover lift, icon box 28px
- **Queue panel:** 14px radius, shadow, tabs 12px, search 10px radius focus ring
- **Table:** th uppercase 10px, td 16px, row hover + arrow highlight, avatar 34px, status pill uppercase
- **Empty state:** 48px icon box, 64px padding, better copy
- **Safety note:** card 12px radius, icon box 32px, secondary button hover
- **Drawer:** 540px, shadow, timeline dot 20px
- **Guided execution:** calm — opacity + translateY 4px 0.32s ease, no scale bounce, no infinite shimmer, fixed durations, replay only when runId changes

---

## Local setup

Requires **Node.js 22.12+**, npm, PostgreSQL 17. Docker Compose v2 is provided.

```bash
npm ci
test -f .env || cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run queue:init
npm run demo:configure
```

`demo:configure` enables local execution and generates token in ignored `.env.local`. Restart processes after changes.

Three terminals:

```bash
# Terminal 1 — simulated warehouse
npm run simulator

# Terminal 2 — durable job consumer
npm run worker

# Terminal 3 — loopback web app
npm run demo:dev
```

Open **http://localhost:3000** → landing → Demo lab. Use exact origin unless you change `RELAY_DEMO_ORIGIN`. Both `dev` and `demo:dev` bind to loopback. Do not expose enabled lab via public proxy.

**Read-only modes:**
```bash
RELAY_DATA_SOURCE=fixtures npm run dev
npm run build && npm start
```
Production always disables lab API, even if opt-in set. Fixture mode also disables execution.

---

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
RELAY_BROWSER_TESTS=true node scripts/check-guided-demo.mjs
RELAY_BROWSER_TESTS=true node scripts/check-storefront.mjs
```

- **65 unit + 54 DB** pass
- Guided browser: 3 synthetic purchases, pending identity preserved, exact evidence, pacing visible, calm transitions, no runtime errors
- Storefront browser: catalog/category/product/cart, 6 flows, lost-response retry creates one order, guards, no page errors
- Build: `/` static, `/console` dynamic, 4 products SSG

---

## Project structure

```
src/
  app/
    page.tsx              → portfolio landing (static)
    console/              → ops console (dynamic)
    demo/                 → guided demo
    store/                → Northline storefront
    runs/[id]/            → evidence
  components/
    relay-landing.*       → landing UI
    relay-console.tsx     → console UI
    guided-execution.*    → calm staged flow
    live-journey.*        → system activity widget
    store-*.tsx           → storefront
  demo/ live-stages.ts    → 4-stage derivation
  lab/                    → contracts, recovery policy
  server/                 → console data
scripts/
  simulator.ts, worker.ts, migrate.ts, seed.ts
  check-guided-demo.mjs, check-storefront.mjs
```

---

## Safety

- Fictional store Northline, no real payments or shipments
- No PII, no real customer data
- No Shopify integration in this repo
- No production auth, no address correction, no force submission
- Bounded retries + reference lookups operate only against local simulator 4010

---

## Portfolio context

This repo is **DeadPoet404/relay-ops**, public, built incrementally via `git am ~/Downloads/*.patch`.

Increments:
- 001 UI foundation
- 002 persistence
- 003 local lab
- 004 safe recovery
- 005 Northline storefront
- 006 guided demonstration
- 007 persistent live journey with real pacing
- 008 guided execution flow with system activity
- 009 fix: guided activity replay
- 010 realistic variable pacing
- 011 calm transitions (fix chaotic glitch)
- 012 portfolio landing that sells the story
- 013 console UI polish

For agency work: clean minimal console, real durable execution, persuasive presentation, no toy loaders.
