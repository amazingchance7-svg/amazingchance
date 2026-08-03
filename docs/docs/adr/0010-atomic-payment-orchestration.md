# ADR 0010 — Atomic verified-payment orchestration

## Status

Accepted.

## Decision

`PaymentOrchestratorService.confirmPayment(paymentId)` is the only operation that converts a succeeded payment into tickets. It runs at PostgreSQL `SERIALIZABLE` isolation and, in one transaction:

1. validates payment amount, currency and state;
2. appends and seals the balanced ledger transaction;
3. reserves one ticket-number range;
4. inserts ticket rows;
5. completes the purchase;
6. appends a sealed purchase-state event.

Payment ID determines ledger idempotency. Purchase ID remains unique in `TicketAllocation`. Repeated processing returns the existing committed result. Any failed step rolls back the whole operation.

Payment-provider signature verification remains a separate boundary and may invoke this orchestrator only after verification.
