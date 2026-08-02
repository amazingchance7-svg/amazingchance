# Amazing Chance — Architecture Blueprint

## 1. Mission

Amazing Chance is a global ticket-based draw platform with a web client, Telegram bot, future mobile clients, administrative tools, payment-provider integrations, and publicly verifiable draw results.

The architecture must prioritize:

1. Correctness of money and ticket operations.
2. Prevention of duplicate or overlapping ticket allocation.
3. Idempotent processing of all retryable operations.
4. Publicly verifiable draw integrity.
5. Strong auditability and operational recovery.
6. Secure-by-default service boundaries.

No architecture can guarantee absolute immunity from compromise or defects. The objective is layered risk reduction, rapid detection, safe recovery, and prevention of single-point failures.

## 2. Technology baseline

- Monorepo: pnpm workspaces.
- Backend: NestJS.
- Database: PostgreSQL as the system of record.
- ORM: Prisma.
- Cache and coordination: Redis, never as the authoritative financial store.
- API: REST first; internal services remain transport-independent.
- Background processing: durable outbox plus workers.
- Deployment: containerized environments with separate local, test, staging, and production configurations.

## 3. Architectural style

The initial system is a modular monolith with strict bounded contexts. This provides transactional safety and lower operational complexity while preserving a path to service extraction.

Modules communicate through public application services or domain events. They do not write directly to another module's critical tables.

Core contexts:

- Identity and access.
- Users and compliance profile.
- Lottery draws.
- Purchases.
- Payments.
- Ticket allocation and tickets.
- Draw execution and fairness.
- Notifications.
- Administration and audit.

## 4. Critical transaction

A paid purchase becomes complete only when the following state is committed atomically:

```text
verified successful payment
+ confirmed purchase state
+ one ticket allocation
+ exact expected ticket records
+ state transition events
+ audit record
+ outbox event
```

If any component fails, the transaction rolls back.

## 5. Core invariants

- One ticket number can belong to only one ticket within a draw.
- One purchase can have only one allocation.
- An allocation is one continuous range.
- Allocation size equals the authoritative purchase ticket count.
- Ticket creation occurs only after verified payment confirmation.
- A completed purchase has the exact expected number of tickets.
- Draw results are immutable after finalization.
- No administrator can directly select a winner.
- Client-supplied prices and totals are never authoritative.

## 6. Security model

Security is layered:

- authentication and session security;
- explicit authorization;
- strict input validation;
- idempotency and replay protection;
- database constraints;
- transaction isolation and row locking;
- secret management;
- append-only audit trails;
- rate limiting and abuse controls;
- monitoring and incident response.

## 7. Reliability model

The system uses:

- PostgreSQL transactions for critical state;
- `SERIALIZABLE` isolation for payment-to-ticket completion;
- bounded retry of recognized transient errors;
- an outbox pattern for post-commit side effects;
- health, readiness, metrics, and structured logs;
- tested backups and point-in-time recovery where supported.

## 8. Change control

Any change to payment confirmation, purchase states, ticket allocation, draw fairness, database constraints, authorization, or transaction boundaries requires:

1. an updated architecture document;
2. an ADR where the decision is significant;
3. migration and rollback analysis;
4. automated tests;
5. staged deployment validation.
