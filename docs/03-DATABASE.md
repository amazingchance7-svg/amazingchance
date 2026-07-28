# Database

PostgreSQL is the system of record. Prisma 7 is the approved ORM.

## Principles
- UUID internal primary keys
- Separate public identifiers where needed
- UTC timezone-aware timestamps
- Integer minor units for money
- Explicit currency codes
- Append-only financial and audit records
- Restrictive foreign-key deletion
- Unique idempotency constraints

## Main domains
Users, draws, purchases, payments, payment attempts, webhooks, tickets, snapshots, randomness evidence, winners, prizes, payouts, ledger, and audit.

Finalized snapshots, randomness evidence used in a draw, published results, ledger entries, and audit logs are immutable. Applied production migrations are immutable.
