# ADR-0006: Transactional Outbox

## Status
Accepted

## Decision
Write durable outbox events in the same transaction as business state and process external side effects after commit.

## Rationale
This prevents committed purchases from losing notifications or downstream events during process failure.
