# Amazing Chance — Prisma, Migrations and Data Integrity Audit

**Audit baseline:** uploaded project archive `amazingchance.zip`  
**Scope:** `apps/api/prisma/schema.prisma`, all four Prisma migrations, financial models, relations, indexes, and database-enforceable invariants.  
**Status:** Architecture baseline — do not implement new payment/draw functionality before P0/P1 decisions are fixed.

## Executive conclusion

The schema has a strong domain foundation: UUID primary keys, minor-unit money in `BigInt`, explicit lifecycle enums, broad use of `onDelete: Restrict`, public identifiers, idempotency fields, ticket uniqueness per draw, immutable snapshot concepts, randomness evidence, double-entry ledger concepts, and audit records.

However, the database currently trusts application code for many invariants that must be enforced by PostgreSQL in a global lottery/financial platform. The most serious gap is not missing tables; it is missing cross-table consistency and financial constraints. The current schema can store internally contradictory records even when every foreign key is valid.

**Current rating:**

- Domain coverage: **8/10**
- Relation design: **7/10**
- Index design: **7/10**
- Financial integrity enforcement: **3/10**
- Cross-entity consistency: **3/10**
- Migration discipline: **7/10**
- Production readiness: **4/10**

## What is already correct

1. Monetary values use `BigInt` minor units rather than floating point.
2. Currency is copied into purchases, payments, prizes, payouts and ledger transactions.
3. Historical business records mostly use `onDelete: Restrict`.
4. Ticket number uniqueness is enforced by `@@unique([drawId, numberInDraw])`.
5. One allocation per purchase is enforced by unique `purchaseId`.
6. One snapshot per draw is enforced by unique `drawId`.
7. Winner rank, winning ticket and random position are unique within a draw.
8. Payment attempts, webhooks, randomness requests, payouts and ledger transactions have idempotency/uniqueness mechanisms.
9. Refresh and user-token hashes are unique and indexed by expiry/use state.
10. Migration history is linear and the current schema is represented by applied migrations.

## P0 — database integrity blockers

### 1. Cross-entity identity can contradict itself

Foreign keys prove that referenced rows exist, but do not prove they belong to the same business aggregate.

Examples currently allowed by the database:

- A `Ticket` can point to Purchase A but use another `userId` or `drawId`.
- A `TicketAllocation` can point to a purchase from one draw and a different `drawId`.
- A `DrawWinner` can combine a draw, ticket and snapshot entry from different draws.
- A `Prize` can use a different user, draw or rank than its `DrawWinner`.
- A `Payout` can use a different user, currency or amount than its `Prize`.

**Required direction:** reduce duplicated foreign keys where possible, or enforce composite foreign keys/constraints. Critical write flows must also validate consistency inside one transaction.

### 2. The ledger is not database-enforced double-entry accounting

The schema does not guarantee that:

- every transaction has at least two postings;
- debit total equals credit total;
- posting amounts are positive;
- postings cannot be changed or deleted later;
- all postings belong to the transaction currency;
- a business event creates only the expected ledger transaction set.

A `LedgerTransaction` can exist with zero postings or an unbalanced set.

**Required direction:** PostgreSQL deferred constraint trigger or controlled stored procedure for balance validation; positive amount checks; append-only permissions/triggers; immutable transaction/posting records.

### 3. Financial amounts and currencies can disagree

The database permits:

- payment amount/currency different from purchase;
- purchase total different from `ticketPriceMinor × requestedTicketCount`;
- payout amount/currency different from prize;
- negative or zero payment, prize, payout and ledger amounts;
- a confirmed payment without a corresponding purchase confirmation/ledger allocation.

**Required direction:** CHECK constraints for positivity and arithmetic where row-local; transactional services and reconciliation constraints for cross-table equality.

### 4. Allocation rules are not safe historical financial rules

`AllocationRule` does not enforce:

- basis points sum to 10,000;
- each share is non-negative and within range;
- effective periods do not overlap;
- only one rule is active at a time;
- historical purchases/ledger transactions record which rule version was applied;
- rules are immutable after use.

The product rule is 70% weekly, 10% annual, 20% company, but the schema does not anchor a purchase or ledger allocation to a rule version.

**Required direction:** constraints, non-overlapping effective range, immutable versioning, and `allocationRuleId`/version snapshot on the relevant financial event.

### 5. Snapshot membership can contain duplicate tickets

`TicketSnapshotEntry` enforces unique position but not unique ticket per snapshot. The same ticket can be inserted twice at different positions.

**Required direction:** add `@@unique([snapshotId, ticketId])`. Also index `ticketId` for reverse lookup and FK operations.

### 6. Randomness evidence is weakly typed

`randomPositions` is JSON. PostgreSQL cannot enforce:

- integer-only values;
- exact `requestedCount` length;
- uniqueness of positions;
- every position within requested min/max;
- winner rows exactly match verified randomness.

**Required direction:** normalized child table `RandomnessPosition` or a canonical immutable evidence artifact plus strict application validation and hash/signature verification. For a verifiable platform, normalized positions are preferable.

## P1 — required before payments and ticket issuance

### 7. Purchase idempotency scope is wrong

`Purchase.idempotencyKey` is globally unique. It should normally be scoped to actor/operation, for example `(userId, idempotencyKey)`, and must be supplied by the client. A server-generated random key does not prevent duplicate retries.

### 8. Payment provider identifiers must be provider-scoped

`providerTransactionId` and `providerSessionId` are globally unique. Different providers may produce the same identifier.

**Recommended:** unique `(provider, providerTransactionId)`. Payment attempts need provider context directly or through a provider-stable payment relation.

### 9. Multiple successful payments for one purchase are possible

The schema permits multiple `Payment` rows with `SUCCEEDED` for the same purchase. This may be useful for retries/alternatives, but only one successful settlement (or an explicitly modeled multi-payment total) should be accepted.

**Required decision:** one-payment-per-purchase versus multi-payment aggregation. Enforce with a partial unique index or a settlement model.

### 10. Ticket allocation range integrity is incomplete

Missing constraints:

- `startNumber > 0`;
- `endNumber >= startNumber`;
- allocated count equals paid/requested ticket count;
- no overlapping ranges for the same draw if rows are inserted outside the sequence service.

The atomic sequence algorithm is good, but the database still accepts manually contradictory allocation rows.

**Recommended:** CHECK constraints and, if direct writes remain possible, a PostgreSQL exclusion constraint over integer ranges per draw.

### 11. Status/timestamp consistency is not enforced

Examples allowed:

- `Payment.status = SUCCEEDED` with null `confirmedAt`;
- `Ticket.status = VOIDED_BY_REFUND` with null `voidedAt`;
- `Prize.status = PAID` with null `paidAt`;
- finalized snapshot without hash/finalized time;
- published draw without completed/published times.

**Required direction:** CHECK constraints for stable state/timestamp invariants where practical.

## P1 — draw and ticket integrity

### 12. Draw dates and numeric values lack checks

Missing row-level constraints include:

- ticket price > 0;
- winner count > 0;
- sequence number > 0;
- requested ticket count > 0;
- sales open < sales close <= scheduled draw;
- completedAt <= publishedAt;
- participation year within a reasonable range.

### 13. Annual draw uniqueness is not guaranteed

If the product permits one annual draw per year, the schema currently allows several annual draws with the same `participationYear` because uniqueness is only `(type, sequenceNumber)`.

**Required decision:** whether annual draw is unique per year. If yes, add a PostgreSQL partial unique index.

### 14. Ticket snapshot metadata needs stronger canonicalization

`canonicalFormat`, `hashAlgorithm`, and `snapshotHash` are free text. The schema should record a versioned canonical format and preferably fixed algorithm enum/version. Historical entries need creation/finalization metadata and immutable storage reference.

### 15. Winner consistency requires more than current unique indexes

Current winner uniqueness is good, but it does not prove:

- snapshot entry belongs to the draw snapshot;
- ticket equals snapshot entry ticket;
- `randomPosition` equals snapshot entry position;
- rank is between 1 and draw winner count.

These must be validated transactionally, with some invariants moved into composite keys or constraints.

## P2 — identity, security and retention

### 16. Email uniqueness is case-sensitive

PostgreSQL `TEXT UNIQUE` can treat `User@example.com` and `user@example.com` as different. Normalize email before write and/or use `citext` with a unique index.

### 17. No roles or permission model

The user table has status but no role/permission model. This is a schema blocker for safe administration.

### 18. Cascading deletion of auth tokens is acceptable; core history should remain restricted

`RefreshToken` and `UserToken` cascade on user deletion. Core business data correctly uses `Restrict`. The preferred production rule remains: do not physically delete users with business history; close/anonymize them.

### 19. Audit log is conceptually append-only but not enforced

`AuditLog` has good lookup indexes, but rows can still be updated/deleted by any DB credential with write permissions. There is no hash chain or tamper-evidence.

**Required direction:** restricted DB role, append-only triggers/policies, optional hash chaining or immutable external archive for high-trust evidence.

## Index audit

### Strong indexes already present

- User status and unique email.
- Draw status/schedule and type/year.
- Purchase user chronology, draw/status, status/expiry.
- Payment purchase/status and provider/status.
- Webhook status/time and provider event uniqueness.
- Ticket draw/status, user/time, purchase, and unique draw number.
- Randomness draw/status and attempt uniqueness.
- Winner draw uniqueness dimensions.
- Prize user/status and status/time.
- Payout prize/status and user/time.
- Ledger reference and account/time.
- Audit entity, actor and correlation lookup.

### Missing or questionable indexes

1. `ticket_snapshot_entries(ticketId)` and unique `(snapshotId, ticketId)`.
2. Provider-scoped transaction/session unique indexes.
3. `payouts(provider, status)` or provider transaction reconciliation index when payout integration exists.
4. Active token cleanup indexes may benefit from partial indexes, depending on volume.
5. Draw public queries may need `(type, status, scheduledDrawAt)` after workload measurements.
6. Public ticket verification may need direct indexes based on exact query patterns; do not add speculative indexes before measuring.

## Migration audit

### Positive

- Four migrations are ordered and coherent.
- Current schema fields are represented in migration history.
- Ticket sequence/allocation was added in a separate migration.
- No evidence of editing an already-applied migration in the uploaded snapshot.

### Risks

1. The initial migration contains many future modules before their code exists. This is not schema drift, but it creates an apparently production-capable database without corresponding services.
2. The initial migration lacks CHECK constraints and specialized PostgreSQL constraints required for financial correctness.
3. Applied migrations must never be edited now. All fixes require new migrations.
4. Before production, migrations need CI validation against an empty database and an upgrade test from the previous release.
5. Use `prisma migrate deploy` in production; never `migrate dev`.

## Recommended correction sequence

### Database hardening milestone A — before payment code

1. Decide and document entity ownership/cross-entity invariants.
2. Add positive/range/date CHECK constraints.
3. Add unique snapshot ticket membership.
4. Fix provider-scoped identifiers.
5. Define purchase idempotency scope.
6. Decide one versus multiple successful payments per purchase.
7. Add allocation rule invariants and historical version link.
8. Define ledger balance enforcement and append-only controls.

### Milestone B — before ticket issuance

1. Enforce allocation range checks and purchase/draw consistency.
2. Make ticket creation derive user/draw from purchase rather than accept arbitrary IDs.
3. Add transactionally enforced exact ticket count.
4. Add ticket status/timestamp checks.

### Milestone C — before first real draw

1. Normalize randomness positions.
2. Enforce snapshot membership uniqueness and canonical versioning.
3. Enforce winner/snapshot/ticket/draw consistency.
4. Add draw lifecycle timestamp constraints.
5. Add annual draw uniqueness if required.
6. Make snapshot, randomness, winner and audit records append-only.

### Milestone D — before payout

1. Enforce prize/winner/user/draw consistency.
2. Enforce payout/prize/user/currency/amount consistency.
3. Add payout settlement/reconciliation model.
4. Complete balanced ledger and reconciliation reports.

## Frozen architectural decisions from this audit

These should be treated as baseline unless changed through an explicit ADR:

1. PostgreSQL is the financial and lottery system of record.
2. Money remains `BigInt` minor units.
3. Business history is append-only; corrections use compensating records.
4. Tickets are generated only after confirmed payment.
5. One purchase receives at most one ticket allocation range.
6. Ticket numbers are unique inside a draw and allocated atomically.
7. Snapshot membership must be unique and immutable.
8. Randomness evidence and winner selection must be normalized, deterministic and publicly verifiable.
9. Financial allocation rules are versioned, immutable after use, and linked to financial events.
10. Ledger transactions must be balanced and append-only at the database level.
11. Cross-entity consistency must not rely solely on application code.
12. Applied migrations are never edited; fixes are additive migrations.

## Next audit

Before proposing code changes, complete the security/authentication audit and business-flow audit, then combine all findings into one prioritized remediation roadmap. New feature code should not be added until the P0 data-integrity and API-authorization decisions are fixed.
