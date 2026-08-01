# Amazing Chance — Remediation Plan

**Baseline:** repository, backend, Prisma/data-integrity, and security audits  
**Status:** Active execution plan  
**Rule:** No new payment, draw, payout, or public-production functionality may be implemented before all applicable P0 decisions and blockers are resolved.

---

## 1. Purpose

This document is the single source of truth for corrective engineering work in Amazing Chance.

It consolidates findings from:

- `01_REPOSITORY_STRUCTURE_AUDIT.md`
- `02_BACKEND_MODULES_AUDIT.md`
- `03_PRISMA_DATA_INTEGRITY_AUDIT.md`
- `04_SECURITY_AUDIT.md`

Work must be executed in dependency order. A task is complete only when its implementation, migrations, tests, documentation, and review criteria are satisfied.

---

## 2. Status Values

| Status | Meaning |
|---|---|
| `TODO` | Not started |
| `DESIGN` | In architectural/design review |
| `READY` | Approved for implementation |
| `IN_PROGRESS` | Being implemented |
| `BLOCKED` | Waiting on another decision or task |
| `REVIEW` | Implementation complete; awaiting verification |
| `DONE` | All acceptance criteria passed |
| `DEFERRED` | Explicitly postponed with reason |

---

## 3. Execution Rules

1. Work on one remediation item or one tightly coupled batch at a time.
2. Do not bypass prerequisites.
3. Applied migrations are never edited; all fixes use additive migrations.
4. Every P0/P1 change requires automated tests.
5. Critical state transitions must be atomic and idempotent.
6. Financial and lottery invariants must be enforced in PostgreSQL where practical.
7. External side effects must not execute inside long-running database transactions.
8. Any deviation from frozen architectural decisions requires an ADR.
9. Audit documents are historical baselines and are not rewritten after fixes; completion is tracked here.
10. Every completed item must record the commit or pull request reference.

---

# 4. Milestone M0 — Repository and Test Foundation

Goal: establish a safe delivery pipeline before modifying critical business logic.

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| REP-001 | P0 | Add backend test framework and root `test` scripts | None | DONE |
| REP-002 | P0 | Add CI for install, Prisma validate/generate, migrations, typecheck, build, lint, tests | REP-001 | IN_PROGRESS |
| REP-003 | P1 | Add clean archive/export script excluding secrets and generated files | None | TODO |
| REP-004 | P2 | Replace root README with project onboarding documentation | None | TODO |
| REP-005 | P1 | Add environment-safe test database workflow | REP-001 | DONE |

## REP-001 — Test framework

**Required implementation**

- Configure Jest or Vitest for `apps/api`.
- Add unit-test and integration-test commands.
- Add root workspace scripts:
  - `test`
  - `test:unit`
  - `test:integration`
  - `test:coverage`
- Create initial tests for existing auth and ticket-allocation code.

**Acceptance criteria**

- `pnpm test` runs successfully.
- Test failures return non-zero exit status.
- Test environment cannot connect to production credentials.
- At least one transaction/concurrency integration test runs against PostgreSQL.

---

## REP-002 — Continuous integration

**Required checks**

1. frozen-lockfile install;
2. secret scan;
3. dependency vulnerability scan;
4. Prisma format/validate;
5. migrate a clean PostgreSQL database;
6. Prisma generate;
7. backend typecheck and build;
8. frontend typecheck and build;
9. lint;
10. automated tests.

**Acceptance criteria**

- All checks run on every pull request.
- Merges are blocked when required checks fail.
- CI artifacts are generated from source, not local build directories.

---

# 5. Milestone M1 — Public API Security Blockers

Goal: make the existing API safe enough for controlled staging. Public production remains prohibited until all M1 items are complete.

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| SEC-001 | P0 | Remove or protect public `UsersController` administration endpoints | REP-001 | TODO |
| SEC-002 | P0 | Remove external `passwordHash` acceptance | SEC-001 | TODO |
| SEC-003 | P0 | Protect lottery-draw mutation endpoints | REP-001 | TODO |
| SEC-004 | P0 | Introduce roles and permission-based authorization | REP-001 | TODO |
| SEC-005 | P0 | Enforce active/verified state in JWT validation | REP-001 | TODO |
| SEC-006 | P0 | Enforce active/verified state during refresh | SEC-005 | TODO |
| SEC-007 | P0 | Revoke sessions on suspension/closure | SEC-004, SEC-006 | TODO |
| SEC-008 | P0 | Stop logging verification/reset tokens | None | TODO |
| SEC-009 | P0 | Enforce production secret strength | None | TODO |
| SEC-010 | P0 | Add authentication rate limiting | REP-001 | TODO |
| SEC-011 | P1 | Disable/protect Swagger in production | None | TODO |
| SEC-012 | P1 | Add Helmet and reviewed security headers | None | TODO |
| SEC-013 | P1 | Define CORS allowlists per environment | None | TODO |
| SEC-014 | P1 | Add request/correlation IDs and log redaction | None | TODO |

## SEC-001 / SEC-002 — Users API lockdown

**Required direction**

- Remove public `POST /users`.
- Ordinary users are created only by `POST /auth/register`.
- Move administrative user operations under `/api/v1/admin/users`.
- Require authentication and explicit permissions.
- Do not expose password hashes in DTOs.
- Replace physical user deletion with close/anonymize workflow.

**Acceptance criteria**

- Anonymous requests to all administrative user endpoints return `401`.
- Authenticated customers return `403`.
- No public DTO contains `passwordHash`.
- Registration always hashes passwords through one approved service.
- Automated authorization tests pass.

---

## SEC-003 / SEC-004 — Draw administration and permissions

**Initial permission set**

- `user.read`
- `user.status.change`
- `user.anonymize`
- `draw.read.admin`
- `draw.create`
- `draw.update`
- `draw.open_sales`
- `draw.close_sales`
- `draw.cancel`
- `draw.publish`
- `audit.read`

**Acceptance criteria**

- Draw mutation routes require dedicated permissions.
- All privileged actions record actor, target, reason, result, and correlation ID.
- Deny-by-default behavior is tested.

---

## SEC-005 / SEC-006 / SEC-007 — Current account state

**Required behavior**

Every protected request and token refresh must require:

- user exists;
- `status = ACTIVE`;
- `emailVerifiedAt IS NOT NULL`.

Suspending or closing an account must revoke all active refresh tokens in the same controlled operation.

**Acceptance criteria**

- Suspended users cannot use existing access tokens for protected actions.
- Suspended users cannot refresh.
- Closure/suspension creates an audit event.
- Concurrency tests cover refresh versus suspension.

---

# 6. Milestone M2 — Database Integrity Hardening

Goal: prevent PostgreSQL from storing contradictory financial or lottery records.

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| DB-001 | P0 | Define and enforce cross-entity identity invariants | None | DESIGN |
| DB-002 | P0 | Add positive/range/date CHECK constraints | DB-001 | TODO |
| DB-003 | P0 | Add unique snapshot membership `(snapshotId, ticketId)` | None | TODO |
| DB-004 | P0 | Version and link allocation rules to financial events | DB-001 | DESIGN |
| DB-005 | P0 | Define DB-enforced balanced, append-only ledger | DB-001 | DESIGN |
| DB-006 | P1 | Scope provider transaction/session identifiers by provider | None | TODO |
| DB-007 | P1 | Decide and enforce one successful payment per purchase | None | DESIGN |
| DB-008 | P1 | Add ticket-allocation range integrity constraints | DB-001 | TODO |
| DB-009 | P1 | Add status/timestamp consistency constraints | None | TODO |
| DB-010 | P2 | Normalize case-insensitive email uniqueness | None | TODO |
| DB-011 | P1 | Normalize randomness positions | DB-001 | DESIGN |
| DB-012 | P1 | Make audit records technically append-only | None | DESIGN |

## DB-001 — Cross-entity invariants

The following must never contradict:

- `Ticket.purchaseId`, `Ticket.userId`, `Ticket.drawId`;
- `TicketAllocation.purchaseId`, `TicketAllocation.drawId`;
- `DrawWinner.drawId`, ticket draw, snapshot draw and snapshot entry;
- `Prize` versus winner/user/draw/rank;
- `Payout` versus prize/user/currency/amount;
- payment amount/currency versus purchase.

**Implementation rule**

Prefer removing redundant writable identifiers. Where redundancy is necessary, use composite keys/foreign keys, CHECK constraints, triggers, and transactional validation.

**Acceptance criteria**

- Contradictory fixture inserts fail at the database or controlled service boundary.
- Tests demonstrate every listed invariant.

---

## DB-002 — Required row-level checks

Add additive migrations for applicable constraints:

- monetary amounts > 0;
- ticket counts > 0;
- winner count > 0;
- sequence numbers > 0;
- ticket allocation start > 0;
- allocation end >= start;
- allocation basis points total = 10,000;
- each basis-point component in valid range;
- sales open < sales close <= scheduled draw;
- completed time <= published time;
- status-dependent timestamps.

Do not edit existing migrations.

---

## DB-003 — Snapshot uniqueness

Add:

```prisma
@@unique([snapshotId, ticketId])
@@index([ticketId])
```

**Acceptance criteria**

- Same ticket cannot occupy two positions in one snapshot.
- Migration succeeds on clean and upgrade databases.
- Snapshot-generation tests cover duplicate attempts.

---

## DB-005 — Ledger integrity

**Required frozen properties**

- postings use positive minor-unit amounts;
- each ledger transaction has at least two postings;
- total debit equals total credit;
- entries are append-only;
- corrections use compensating transactions;
- transaction and postings use one currency;
- a business event cannot create duplicate ledger transactions.

**Design decision required**

Choose one controlled implementation:

1. PostgreSQL stored procedure plus deferred constraint trigger; or
2. controlled write service plus deferred database validation trigger.

Application-only validation is not sufficient.

---

# 7. Milestone M3 — Purchase Lifecycle and Idempotency

Goal: make purchases safe under retries, concurrency, payment callbacks, and expiration.

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| PUR-001 | P0 | Introduce explicit purchase state machine | DB-002, REP-001 | TODO |
| PUR-002 | P0 | Use client-provided idempotency keys | PUR-001 | TODO |
| PUR-003 | P0 | Make cancellation an atomic conditional transition | PUR-001 | TODO |
| PUR-004 | P0 | Re-check/lock draw inside purchase creation transaction | PUR-001 | TODO |
| PUR-005 | P1 | Implement durable purchase expiration | PUR-001 | TODO |
| PUR-006 | P1 | Ensure every transition creates state and audit events | PUR-001, SEC-014 | TODO |

## PUR-001 — Purchase state machine

Approved baseline transitions:

```text
CREATED → PAYMENT_PENDING
CREATED → CANCELLED
CREATED → EXPIRED
PAYMENT_PENDING → PAYMENT_CONFIRMED
PAYMENT_PENDING → CANCELLED
PAYMENT_PENDING → EXPIRED
PAYMENT_CONFIRMED → TICKET_ALLOCATION_PENDING
TICKET_ALLOCATION_PENDING → COMPLETED
```

No arbitrary status update is allowed.

**Acceptance criteria**

- One transition service owns purchase status changes.
- Conditional updates prevent stale writes.
- Invalid transitions return stable domain errors.
- Every successful transition produces `PurchaseStateEvent`.
- Concurrency tests cover cancellation versus payment confirmation.

---

## PUR-002 — Idempotency

**Required behavior**

- Client sends `Idempotency-Key`.
- Scope uniqueness to user and operation.
- Store request fingerprint.
- Same key + same request returns original result.
- Same key + different request returns conflict.
- The server must not generate a new idempotency key for each retry.

---

# 8. Milestone M4 — Payment Security and Settlement

Goal: add payments without creating duplicate, forged, or partially applied financial operations.

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| PAY-001 | P0 | Decide provider adapter contract | M1, M2, M3 | BLOCKED |
| PAY-002 | P0 | Implement signed raw-body webhook verification | PAY-001 | BLOCKED |
| PAY-003 | P0 | Implement durable webhook replay protection | PAY-002, DB-006 | BLOCKED |
| PAY-004 | P0 | Verify merchant, purchase, amount and currency | PAY-002 | BLOCKED |
| PAY-005 | P0 | Enforce one successful settlement per purchase | DB-007, PUR-001 | BLOCKED |
| PAY-006 | P0 | Implement atomic payment-to-ledger-to-ticket orchestration | PAY-003, PAY-004, PAY-005, DB-005 | BLOCKED |
| PAY-007 | P1 | Add payment reconciliation workflow | PAY-006 | BLOCKED |
| PAY-008 | P1 | Add refund model and compensating ledger entries | PAY-006 | BLOCKED |

## PAY-006 — Critical transaction boundary

After a verified payment event, one controlled database transaction must:

1. idempotently claim the provider event;
2. validate purchase state;
3. create/update payment settlement;
4. transition purchase to confirmed;
5. apply allocation rule version;
6. create balanced ledger transaction/postings;
7. reserve ticket range;
8. create exact ticket rows;
9. transition purchase to completed;
10. create state/audit/outbox events;
11. mark webhook processed.

External provider calls must not occur inside this database transaction.

---

# 9. Milestone M5 — Tickets Module Completion

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| TKT-001 | P1 | Register and export `TicketAllocationService` | REP-001 | TODO |
| TKT-002 | P1 | Implement `TicketsService` for exact row creation | DB-008 | TODO |
| TKT-003 | P0 | Integrate allocation and creation into PAY-006 transaction | PAY-006 | BLOCKED |
| TKT-004 | P1 | Add allocation overlap and exact-count tests | TKT-002 | TODO |
| TKT-005 | P2 | Add public ticket verification endpoint | M6 | BLOCKED |

**Acceptance criteria**

- One confirmed purchase receives one allocation.
- Ticket count equals paid/requested count.
- Ticket numbers never overlap within a draw.
- Retry returns existing allocation/tickets.
- Partial ticket creation rolls back completely.

---

# 10. Milestone M6 — Draw Lifecycle, Snapshot, Randomness and Winners

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| DRW-001 | P0 | Implement explicit draw state machine | SEC-003, REP-001 | TODO |
| DRW-002 | P1 | Make fields immutable by lifecycle state | DRW-001 | TODO |
| DRW-003 | P1 | Replace race-prone draw sequence generation | DRW-001 | TODO |
| DRW-004 | P1 | Replace physical deletion with cancel/archive lifecycle | DRW-001 | TODO |
| SNP-001 | P0 | Implement immutable finalized snapshot | DB-003, TKT-003 | BLOCKED |
| RND-001 | P0 | Implement verified randomness evidence and normalized positions | DB-011, SNP-001 | BLOCKED |
| WIN-001 | P0 | Implement deterministic, versioned winner selection | RND-001 | BLOCKED |
| VER-001 | P1 | Implement public verification package/API | WIN-001 | BLOCKED |

Approved baseline draw progression:

```text
SCHEDULED
→ SALES_OPEN
→ SALES_CLOSED
→ SNAPSHOT_FINALIZED
→ DRAWING
→ COMPLETED
→ PUBLISHED
```

Cancellation rules must be explicitly designed by state.

---

# 11. Milestone M7 — Prizes, Payouts and Reconciliation

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| PRZ-001 | P0 | Enforce winner/prize/user/draw/rank consistency | WIN-001, DB-001 | BLOCKED |
| PAYOUT-001 | P0 | Enforce payout/prize/user/currency/amount consistency | PRZ-001 | BLOCKED |
| PAYOUT-002 | P0 | Add privileged payout approval with MFA/step-up | SEC-004 | BLOCKED |
| PAYOUT-003 | P1 | Implement payout provider idempotency | PAYOUT-001 | BLOCKED |
| PAYOUT-004 | P1 | Implement settlement reconciliation | PAYOUT-003, DB-005 | BLOCKED |
| REF-001 | P1 | Implement refund and void/compensation workflow | PAY-008, TKT-003 | BLOCKED |

---

# 12. Milestone M8 — Operational Hardening

| ID | Priority | Task | Dependencies | Status |
|---|---|---|---|---|
| OPS-001 | P1 | Separate liveness and readiness | None | TODO |
| OPS-002 | P1 | Structured JSON logging | SEC-014 | TODO |
| OPS-003 | P1 | Transactional outbox and retry workers | REP-001 | TODO |
| OPS-004 | P1 | External-call timeouts, retry policies and jitter | OPS-003 | TODO |
| OPS-005 | P1 | Private production network for PostgreSQL and Redis | None | DESIGN |
| OPS-006 | P1 | Backup encryption and restore testing | None | DESIGN |
| OPS-007 | P2 | Container hardening and non-root runtime | None | TODO |
| OPS-008 | P2 | Monitoring, alerting and security-event dashboards | OPS-002 | BLOCKED |
| OPS-009 | P2 | Session management and refresh-token family detection | M1 | TODO |
| OPS-010 | P2 | Admin MFA and step-up authentication | SEC-004 | TODO |

---

# 13. Current Execution Batch

Repository and test foundation work has established the minimum safe environment for security remediation.

Completed foundation items:

```text
REP-001  Backend test framework
REP-005  Environment-safe PostgreSQL integration-test workflow
```

Partially completed foundation item:

```text
REP-002  Continuous integration
```

The next implementation batch must contain only:

```text
REP-002  Complete remaining CI controls
SEC-001  Lock down UsersController
SEC-002  Remove external passwordHash
SEC-003  Protect draw mutations
SEC-004  Add minimum viable roles/permissions
SEC-005  Enforce account state in JWT validation
SEC-006  Enforce account state during refresh
SEC-007  Revoke sessions on suspension/closure
SEC-008  Stop logging raw tokens
SEC-009  Enforce secret strength
SEC-010  Add auth rate limits
```

No payment or draw-engine feature work begins before all applicable P0 items in this batch are `DONE`.

---
# 14. Definition of Done for Every Remediation Item

A task is `DONE` only when all applicable items are complete:

- design approved;
- code implemented;
- migration added and tested;
- unit tests added;
- integration/concurrency tests added;
- authorization tests added;
- documentation updated;
- logs and audit behavior defined;
- security implications reviewed;
- CI passes;
- no known regression;
- commit/PR reference recorded below.

---

# 15. Completion Log

| ID | Status | Commit/PR | Completion date | Notes |
|---|---|---|---|---|
| REP-001 | DONE | `7eb3f54`, `bcacda4` | 2026-08-01 | Jest foundation, root unit/integration/coverage scripts, Argon2 unit tests, PostgreSQL integration and concurrency tests |
| REP-002 | IN_PROGRESS | `4cf7696` and subsequent `rep-001-ci` commits | 2026-08-01 | GitHub Actions runs frozen install, Prisma generate, lint, typecheck, tests, clean-database migrations through integration tests, and build. Secret scan, dependency scan, explicit Prisma format/validate, and required branch protection remain open |
| REP-005 | DONE | `bcacda4` | 2026-08-01 | Dedicated ephemeral PostgreSQL test container, clean migration deployment, deterministic cleanup, and production-separated test credentials |

---
# 16. Frozen Architecture Baseline

Unless changed by ADR:

1. Amazing Chance remains a modular monolith for MVP.
2. PostgreSQL is the financial and lottery system of record.
3. Money uses `BigInt` minor units.
4. Business history is append-only.
5. Corrections use compensating records.
6. Administrative access is denied by default and permission-based.
7. Privileged users require MFA before production admin access.
8. Suspended, closed or unverified users cannot authenticate or refresh.
9. Sensitive tokens and secrets are never logged.
10. External clients never supply password hashes.
11. Critical state changes use explicit state machines.
12. Client retries use client-supplied idempotency keys.
13. Provider webhooks require signature, freshness and replay validation.
14. Browser redirects never confirm payments.
15. Payment confirmation, ledger allocation and ticket issuance use one controlled transaction.
16. Ticket numbers are allocated atomically.
17. One purchase receives at most one allocation range.
18. Snapshot membership is unique and immutable.
19. Randomness evidence is authenticated, normalized and immutable.
20. Winner selection is deterministic, versioned and reproducible.
21. Ledger transactions are balanced and append-only at database level.
22. Cross-entity consistency does not rely solely on application code.
23. Applied migrations are never edited.
24. Critical functionality requires automated tests before expansion.
25. No public production launch occurs while any applicable P0 blocker remains open.

---

# 17. Next Action

Complete the remaining acceptance criteria for `REP-002 — Continuous integration`:

1. add a secret-scanning check;
2. add a dependency vulnerability check with an explicitly reviewed failure policy;
3. add explicit Prisma format and validate checks;
4. confirm the workflow runs on every pull request targeting the protected integration branch;
5. configure the successful CI job as a required branch-protection check.

After REP-002 is complete, begin `SEC-001` and `SEC-002` as one tightly coupled security batch, with authorization and DTO tests added before changing additional public API behavior.