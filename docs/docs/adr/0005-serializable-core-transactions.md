# ADR-0005: Serializable Core Transactions

## Status
Accepted

## Decision
Use `SERIALIZABLE` isolation for payment-confirmation through ticket-completion and draw finalization.

## Consequences
Recognized serialization failures are retried with bounded randomized backoff.
