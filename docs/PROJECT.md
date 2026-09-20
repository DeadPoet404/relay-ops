# Relay — project brief

## Product and audience

Relay is a focused order exception and recovery console for an e-commerce operations team, designed to demonstrate implementation capability to commerce agencies. It is not a storefront, ERP, warehouse management system, or generic automation builder.

The product promise is visibility and safe recovery between payment and warehouse acknowledgement—not guaranteed fulfillment, estimated cost savings, or revenue recovery.

The flagship demonstration follows one order through an integration failure, investigation, a safe resolution, and a durable audit trail. Everything simulated is labelled. Any future measured outcome must state its test environment and method.

## Initial boundary

One Shopify development store, one configurable fulfillment connector, and a fictional reference merchant named Northline Supply. Initially use an explicitly simulated warehouse. Model payment and fulfillment separately: a paid order is not necessarily eligible for fulfillment. Eligibility rules must consider cancellations, payment changes, holds, line-item requirements, and existing fulfillment records.

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

## Planned architecture (not implemented in increment 001)

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

Next.js is the UI and request boundary. The worker is a separate process, not an in-memory timer or a long-running request handler. PostgreSQL supports durable application state and pg-boss jobs, avoiding Redis as an additional initial dependency. Drizzle manages schema/migrations and typed queries. Zod will validate external payloads and server actions.

We must verify atomic state-change/enqueue behaviour during implementation. Queue delivery does not establish exactly-once execution at an external provider. Durable submission identities, unique constraints, connector-level idempotency, status lookups, and tested state transitions provide the actual safety properties.

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

Bounded retries, idempotency and ambiguity checks, scheduled reconciliation, concurrency protection, and authorized human actions. Exercise duplicate events, out-of-order events, missed webhooks, accepted-but-timed-out submissions, failed lookups, job crashes, and repeated operator clicks. Add browser workflows and integration tests.

### 005 — Shopify and deployment hardening

Development-store integration, raw-body HMAC webhook verification, permissions/authentication, secure credential management, request validation, structured redacted logs, basic monitoring, deployment of web and worker processes, migration strategy, backups, and recovery documentation. Verify actual Shopify API constraints when implementing; do not assume any arbitrary paid order can be fulfilled by this connector.

### 006 — Public evidence

Reproducible scenario script, architecture diagram, engineering tradeoff write-up, and a short walkthrough. Publish implementation/test evidence rather than invented business results. Clearly distinguish prototype, simulated integration, development-store validation, and any later production use.

## Explicit non-goals

Inventory synchronization, returns/refunds, a full multi-tenant SaaS, AI decision-making, billing, automatic cancellation, automatic refunds, and a marketplace of connectors. No real customer data in this public repository.
