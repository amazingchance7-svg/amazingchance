# 12 — Implementation Roadmap

## Phase 0 — Legal and product gates

Before public money is accepted:

- determine target jurisdictions;
- obtain gambling/lottery and promotional-law advice;
- define age, identity, sanctions, AML, tax, and responsible-gaming requirements;
- verify payment-provider acceptance;
- define terms, privacy, refunds, and prize claim rules.

## Phase 1 — Database hardening

1. Review current Prisma schema.
2. Add critical unique constraints and indexes.
3. Add SQL check constraints through migration.
4. confirm deletion policies.
5. Add audit and outbox tables.
6. Add provider-event idempotency records.

## Phase 2 — Ticket completion core

1. Finalize `TicketAllocationService`.
2. Implement narrow `TicketsService`.
3. Implement transaction retry utility.
4. Orchestrate completion in `PurchasesService`.
5. Add state transition policy.
6. Add integration and concurrency tests.

## Phase 3 — Payments

1. Define normalized provider interface.
2. Implement raw-body webhook verification.
3. Add payment/provider-event data model.
4. Implement exact amount/currency/reference verification.
5. Add reconciliation jobs.

## Phase 4 — Security baseline

1. Session rotation and reuse detection.
2. MFA and explicit admin permissions.
3. rate limits and request-size controls.
4. secret management and redaction.
5. security event audit.

## Phase 5 — Draw engine

1. Freeze canonical ticket serialization.
2. Create test vectors.
3. implement commitment and external randomness protocol.
4. implement unbiased deterministic selection.
5. publish independent verification tool/specification.
6. perform external review.

## Phase 6 — Async and observability

1. Outbox workers.
2. Idempotent consumers.
3. structured logs and metrics.
4. critical invariant alerts.
5. operational dashboards.

## Phase 7 — Staging certification

- load and concurrency tests;
- payment sandbox tests;
- restore drill;
- incident drill;
- penetration test;
- fairness review;
- legal launch approval.

## Immediate next engineering task

Review the current Prisma schema against `docs/05_DATABASE.md`. Do not write the next service until the required constraints and transaction model are confirmed.
