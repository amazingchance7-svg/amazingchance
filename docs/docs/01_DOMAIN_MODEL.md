# 01 — Domain Model and Ownership

## Modular-monolith rule

Each domain module owns its state transitions and exposes application-level methods. A module may read selected data owned by another module through a stable contract, but may not directly mutate another module's critical state.

## Identity and access

Owns:

- credentials;
- sessions;
- refresh-token families;
- MFA state;
- roles and permissions;
- authentication security events.

It does not own purchase or draw authorization logic. Domain services still verify ownership and business permission.

## Users

Owns:

- user profile;
- communication preferences;
- compliance status references;
- account restrictions;
- public and internal user identifiers.

## Lottery draws

Owns:

- draw configuration;
- ticket price and currency;
- sale opening and closing times;
- draw lifecycle;
- fairness algorithm version;
- final result and publication status.

No other module changes a draw lifecycle state.

## Purchases

Owns:

- authoritative ticket count;
- authoritative unit price and total;
- currency;
- purchase status;
- idempotency key and request hash;
- purchase transition events.

`PurchasesService` orchestrates the paid-purchase completion transaction.

## Payments

Owns:

- payment attempts;
- provider account and references;
- provider event records;
- verification evidence;
- payment state transitions;
- refund state.

A browser redirect is not proof of payment.

## Ticket allocation

Owns:

- one sequence per draw;
- atomic number-range reservation;
- one allocation per purchase.

The allocation service does not verify payment and does not update purchases.

## Tickets

Owns:

- materialized ticket records;
- public ticket identifiers;
- ticket-to-purchase and ticket-to-draw linkage.

Tickets are immutable after creation except for narrowly defined derived fields.

## Draw execution

Owns:

- eligible ticket snapshot metadata;
- canonical digest;
- randomness commitment and reveal artifacts;
- deterministic winner calculation;
- immutable execution record.

## Administration and audit

Administration is a client of domain services. It does not bypass them.

Audit owns append-only evidence of security-sensitive and business-critical operations.

## Dependency direction

Preferred direction:

```text
controllers / webhook handlers / workers
            ↓
application services
            ↓
domain policies and module services
            ↓
Prisma transaction client
            ↓
PostgreSQL
```

Controllers never implement critical transaction logic.
