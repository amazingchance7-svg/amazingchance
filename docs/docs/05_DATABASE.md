# 05 — Database Architecture

## PostgreSQL role

PostgreSQL is the authoritative source for all money, tickets, draw state, idempotency, and audit evidence.

## Identifier strategy

- Internal primary keys: UUID.
- Public identifiers: non-sequential prefixed IDs such as `PUR_`, `PAY_`, `DRW_`, `TKT_`.
- Public IDs are unique, indexed, and never treated as authorization.

## Money

Use integer minor units with `BigInt` where volume may exceed 32-bit range. Each amount has an explicit currency field.

## Required constraints

At minimum:

```text
UNIQUE Purchase(idempotencyScope, idempotencyKey)
UNIQUE TicketAllocation(purchaseId)
UNIQUE Ticket(drawId, numberInDraw)
UNIQUE PaymentProviderEvent(provider, providerAccount, providerEventId)
UNIQUE DrawResult(drawId)
CHECK Purchase.ticketCount > 0
CHECK TicketSequence.nextNumber > 0
CHECK TicketAllocation.startNumber > 0
CHECK TicketAllocation.endNumber >= TicketAllocation.startNumber
CHECK monetary amounts >= 0
```

Prisma schema limitations may require SQL migrations for check constraints, partial indexes, triggers, or advanced indexes.

## Foreign-key deletion policy

Financial and audit data normally uses `RESTRICT` or no application deletion.

Avoid cascade deletion for:

- purchases;
- payments;
- tickets;
- allocations;
- draw results;
- state events;
- audit records.

## Transaction boundaries

Critical operations accept `Prisma.TransactionClient` so one caller controls one atomic transaction.

The caller owns:

- isolation level;
- retry policy;
- complete rollback boundary;
- final result mapping.

## Isolation levels

Use `SERIALIZABLE` for:

- payment confirmation through ticket completion;
- draw finalization;
- critical refund transitions where eligibility changes.

Use lower isolation only when invariants remain protected by constraints and atomic conditional statements.

## Retry policy

Retry only recognized transient errors such as PostgreSQL serialization failure or deadlock.

Recommended:

- maximum three attempts;
- full transaction retry;
- randomized exponential backoff;
- structured retry logging;
- no retry for validation, authorization, amount mismatch, or unknown defects.

## Lock ordering

To reduce deadlocks, critical flows acquire records consistently:

1. purchase/payment aggregate;
2. draw eligibility record if needed;
3. ticket sequence;
4. allocation and tickets;
5. audit and outbox inserts.

## Migrations

- Every schema change uses a committed migration.
- Production never uses destructive automatic synchronization.
- Migration review checks locks, table rewrites, backfills, indexes, and rollback/forward-fix strategy.
- Large backfills are separated from schema deployment.

## Audit durability

Application audit records are append-only. Database roles used by the application should not have permission to update or delete audit rows once the design is finalized.
