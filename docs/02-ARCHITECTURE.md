# Architecture

Amazing Chance uses a modular monolith for MVP.

```text
Browser / future Telegram client
              |
           Next.js
              |
           NestJS API
       /        |        \
PostgreSQL    Redis    External providers
```

## Planned backend modules
Health, users, authentication, lottery draws, purchases, payments, tickets, snapshots, randomness, winner selection, prizes, payouts, ledger, and audit.

## Layering
Controllers validate and delegate. Application services coordinate use cases. Domain rules remain explicit. Prisma and external adapters handle infrastructure.

## Reliability
Purchase creation, payment sessions, webhooks, ticket issuance, snapshots, randomness requests, draw completion, and payouts must be idempotent.

Use database transactions for changes that must succeed together. Never keep a database transaction open while calling an external provider.

Redis may support rate limiting, locks, caching, and job coordination. PostgreSQL remains the source of truth.
