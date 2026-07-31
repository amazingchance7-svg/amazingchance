# ADR-0001: Modular Monolith

## Status
Accepted

## Decision
Use a modular monolith with strict bounded contexts for the initial platform.

## Rationale
The core purchase flow requires strong atomic transactions. A modular monolith reduces distributed failure modes while preserving extraction boundaries.

## Consequences
Modules may share one PostgreSQL database but do not bypass application-service ownership rules.
