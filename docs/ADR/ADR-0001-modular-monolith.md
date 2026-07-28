# ADR-0001: Use a Modular Monolith for MVP

- Status: Accepted
- Date: 2026-07-28

## Context
The product has multiple domains but no operational evidence requiring independently deployed services.

## Decision
Implement the NestJS backend as a modular monolith with explicit module boundaries.

## Consequences
Benefits: simpler development, deployment, transactions, and lower infrastructure cost. Risk: boundaries rely on engineering discipline.

## Review trigger
Reconsider when scaling, availability, team ownership, or deployment frequency creates measurable pressure.
