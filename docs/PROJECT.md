# Relay — project brief

> **Current implementation: increment 006.** A fictional Northline storefront now feeds real persisted demo purchases into Relay’s existing worker and recovery system. This is a portfolio demonstration of integration engineering, not a production commerce platform or an enterprise OMS replacement. A guided flow now connects the purchase directly to its evidence-based result. See [GUIDED-DEMO.md](GUIDED-DEMO.md).

## Product and audience

Relay is a focused order exception and recovery console for an e-commerce operations team, designed to demonstrate implementation capability to commerce agencies. It is not a storefront, ERP, warehouse management system, or generic automation builder.

The product promise is visibility and safe recovery between payment and warehouse acknowledgement—not guaranteed fulfillment, estimated cost savings, or revenue recovery.

The flagship demonstration follows one order through an integration failure, investigation, a safe resolution, and a durable audit trail. Everything simulated is labelled. Any future measured outcome must state its test environment and method.

## Initial boundary

Revised demonstration scope: a fictional Northline Supply storefront and an explicitly simulated warehouse, connected through real local persistence and worker processing. Shopify development-store integration is deferred; no Shopify account is needed to present the current project. Model payment and fulfillment separately: a paid order is not necessarily eligible for fulfillment. Eligibility rules must consider cancellations, payment changes, holds, line-item requirements, and existing fulfillment records.

Three core scenarios:

1. **Invalid address:** a confirmed rejection requires corrected data and human review, not repeated unchanged retries.
2. **Temporary service failure:** bounded retries with backoff and jitter are permitted only under the connector's supported idempotency/recovery contract.
3. **Ambiguous timeout:** establish whether the original request was accepted before resubmission. Query by external reference. If the provider cannot establish the result, escalate rather than claim safety.

Partial acceptance, inconsistent lookup behaviour, and providers without idempotency will need explicit handling before live use. A general HTTP status is not itself proof that a third-party side effect did not occur.

## Interface principles

- The exception queue is the primary workspace, not a vanity dashboard.
- Show cause, evidence, elapsed time, ownership, and the safest permitted next action.
- Keep failure type separate from resolution status.
- Use colour sparingly, with text labels alongside it.
- Explain uncertainty rather than presenting an unknown outcome as a confirmed failure.
- Show disabled or unavailable functionality honestly.
- Use one data source for related counts and views.
- Support keyboard access, mobile inspection, and reduced motion.
- Do not round away money in production records. The foundation fixtures use whole-dollar USD amounts; later models must preserve currency, minor units, and full display precision.

## Target architecture (Shopify and authenticated access remain deferred)

```text
Shopify verified webhook
          |
          v
Next.js ingestion endpoint ---> PostgreSQL durable event/inbox record
                                         |
                                 transactional enqueue
                                         |
                                         v
                              separate pg-boss worker
                                         |
                         eligibility + connector submission
                                         |
                                         v
                              warehouse connector
                                         |
                      acknowledgement / rejection / unknown
                                         |
                                         v
                       order state + exception + audit record
                                         |
                                         v
                            authenticated operator console

Scheduled reconciliation --> compare local and provider records
                        --> detect missing/stalled work, investigate safely
```

Next.js is the UI and request boundary. The worker is a separate process, not an in-memory timer or a long-running request handler. PostgreSQL supports durable application state and pg-boss jobs, avoiding Redis as an additional initial dependency. Drizzle manages schema/migrations and typed queries. Zod validates the implemented request/connector boundaries.

Atomic application/queue commits and rollback are covered by integration tests. Queue delivery does not establish exactly-once execution at an external provider. Durable submission identities, unique constraints, connector-level idempotency, status lookups, and tested state transitions provide the actual safety properties.

## Candidate domain entities

These are design candidates, not a committed schema:

- Store and integration connection (credentials encrypted or referenced securely).
- Order and fulfillment eligibility facts.
- Source event/inbox record with provider event identity and processing state.
- Fulfillment intent and attempts with durable external reference.
- Exception with failure classification, state, age, and resolution evidence.
- Append-only audit event with actor, action, and relevant redacted metadata.
- Reconciliation run with scope and findings.

PII should be minimized and redacted from logs. Access must be scoped to the store. Secret values must never reach client bundles or audit timelines.

## Increment roadmap and acceptance criteria

### 001 — Interface foundation

Working queue, search, compound filters, sort, details, activity, connection placeholders, and scenario previews using deterministic fixtures. No pretend recovery actions. Test the pure filtering helpers and run lint/type checking/build.

### 002 — Persistence and state model

PostgreSQL via Docker Compose, Drizzle migrations, validated seed data, state transition rules, durable events, and read APIs. Define fixture vs persisted demo mode explicitly. Repeatable setup and database-level tests. Separate domain types from presentation fixtures.

### 003 — Executable simulator and worker

A real simulated warehouse endpoint, durable worker jobs, and controlled failure switches. Demonstrate event-to-submission flow and restart recovery. Do not expose unauthenticated simulator controls publicly.

### 004 — Safe recovery

Shipped for the local simulator: bounded retries, reference lookup, scheduled reconciliation, stale-delivery fencing, concurrent processing protection, and a guarded read-only operator check. Tests exercise accepted-but-timed-out requests, failed lookups, exhausted budgets, duplicate/stale deliveries, atomic scheduling, worker crashes and restart. Browser checks cover six scenarios and mobile layout. Production-authorized human actions, webhook ordering, missed-webhook recovery, and address correction are not implemented in this increment.

### 005 — Connected storefront (revised scope)

A polished fictional everyday-carry storefront, catalog-priced cart, no-charge checkout, durable purchase snapshot, and customer-facing acknowledgement. Separate presenter controls select controlled warehouse failures. Link the same order to Relay's audit and recovery counts. Demonstrate safe retry of a lost checkout response and all six fulfillment paths.

Production authentication, Shopify ingestion, and live-payment integration are deferred rather than prerequisites for a convincing local portfolio demonstration.

### 006 — Guided demonstration and evidence (shipped)

A clear starting page, plain-language scenario selection, direct exact-order result links, evidence-derived summaries, expandable audit, pending-checkout preservation, and explicit working-versus-simulated boundaries. Browser and database checks verify the flow and old-run lookup. Includes a recording outline, not a claimed finished video or public deployment.

### Next — Portfolio presentation

Record the walkthrough, assemble a concise case study and architecture explanation, and publish a browsing-only preview. A public write-enabled demo is a separate isolation/abuse-control task. Publish measured implementation/test evidence rather than invented business outcomes.

## Explicit non-goals

Inventory synchronization, returns/refunds, a full multi-tenant SaaS, AI decision-making, billing, automatic cancellation, automatic refunds, and a marketplace of connectors. No real customer data in this public repository.
