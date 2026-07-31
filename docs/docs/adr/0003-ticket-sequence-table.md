# ADR-0003: Separate Ticket Sequence

## Status
Accepted

## Decision
Store the hot ticket counter in `TicketSequence`, one row per draw, rather than in the general draw record.

## Rationale
This isolates a high-contention counter and keeps draw metadata ownership clear.
