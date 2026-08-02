# ADR-0002: PostgreSQL as System of Record

## Status
Accepted

## Decision
PostgreSQL is authoritative for financial, ticket, draw, idempotency, outbox, and audit state.

## Consequences
Redis and queues are accelerators, never the only copy of critical state.
