# ADR-0004: Atomic Range Reservation

## Status
Accepted

## Decision
Reserve ticket ranges with one PostgreSQL `UPDATE ... RETURNING` statement.

## Rationale
Read-calculate-write is vulnerable to concurrent allocation races. Row-level serialization of the atomic update prevents overlapping ranges.
