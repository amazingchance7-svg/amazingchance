# 02 — Purchases and Tickets

## Purchase lifecycle

Recommended states:

```text
PENDING_PAYMENT
PAYMENT_PROCESSING
PAYMENT_CONFIRMED
TICKET_ALLOCATION_PENDING
COMPLETED
PAYMENT_FAILED
EXPIRED
CANCELLED
REFUND_PENDING
REFUNDED
```

Only explicitly declared transitions are allowed.

## Purchase creation

The backend must:

1. authenticate or establish the allowed purchase identity;
2. load the draw from PostgreSQL;
3. verify that sales are open;
4. validate ticket-count limits;
5. read authoritative price and currency;
6. calculate total in minor units;
7. store the idempotency key and normalized payload hash;
8. create the purchase and its initial state event atomically.

The client may request a ticket count but cannot set price, total, currency, discount, draw status, or purchase status.

## Paid-purchase completion

The payment webhook handler performs cryptographic/provider verification before entering the core transaction.

Inside one `SERIALIZABLE` transaction:

1. obtain the purchase row using `SELECT ... FOR UPDATE` or an equivalent conditional update;
2. load the related draw and verify allocation eligibility;
3. confirm or recognize the already-confirmed payment;
4. transition purchase to `PAYMENT_CONFIRMED` when needed;
5. transition to `TICKET_ALLOCATION_PENDING`;
6. return an existing allocation if present;
7. atomically reserve a range;
8. create `TicketAllocation`;
9. create the exact ticket records;
10. verify the inserted count;
11. transition purchase to `COMPLETED`;
12. write all state events, audit evidence, and an outbox event;
13. commit.

## Allocation algorithm

`TicketSequence.nextNumber` means the next unallocated number.

Reservation uses one PostgreSQL operation:

```sql
UPDATE "ticket_sequences"
SET
  "nextNumber" = "nextNumber" + $ticketCount,
  "updatedAt" = NOW()
WHERE "drawId" = $drawId
RETURNING
  "nextNumber" - $ticketCount AS "startNumber",
  "nextNumber" - 1 AS "endNumber";
```

The application must not read, calculate, and later write the sequence counter.

## Ticket creation contract

`TicketsService.createFromAllocation()` receives:

- transaction client;
- allocation;
- expected ticket count.

It verifies:

- positive range;
- continuous range;
- range size equals expected count;
- draw and purchase match the allocation.

It then inserts tickets with `createMany` and requires the returned count to match exactly.

## Idempotency

- `TicketAllocation.purchaseId` is unique.
- `Ticket(drawId, numberInDraw)` is unique.
- Repeating the same completion operation returns the original completed result.
- Reuse of the same purchase idempotency key with another payload is rejected.

## Failure scenarios

### Crash before commit

No range, tickets, or completed purchase survives.

### Provider retries after commit

The event record and existing purchase result are returned without creating a second allocation.

### Two workers process the same event

The unique provider-event constraint, purchase lock, allocation uniqueness, and ticket uniqueness prevent duplication.

### Draw closes during payment

A documented policy is required. Recommended policy: purchases created while the draw was open remain eligible for a bounded payment grace period recorded on the purchase. The transaction verifies this immutable eligibility timestamp, not only current wall-clock state.

## Refund note

A refund does not delete tickets or history. Eligibility handling must be explicit and auditable. If refunded tickets become ineligible, draw snapshot generation must exclude them deterministically and preserve evidence.
