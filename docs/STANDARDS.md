# Amazing Chance — Engineering Standards

**Status:** Active  
**Scope:** Repository, backend, frontend, database, security, testing, operations, Git, and documentation  
**Authority:** Mandatory unless superseded by an approved ADR

---

# 1. Purpose

This document defines how Amazing Chance must be designed, implemented, reviewed, tested, documented, and operated.

Its purpose is to prevent repeated architectural drift, security regressions, duplicated logic, unsafe shortcuts, and inconsistent implementation decisions.

Audits describe the current state and identified risks.

The remediation plan defines what must be fixed.

This document defines how all future work must be performed.

---

# 2. Decision Hierarchy

When sources conflict, use this order:

```text
Project Vision
↓
Product Rules
↓
Platform Principles
↓
Engineering Standards
↓
Architecture
↓
ADR
↓
Implementation
```

Implementation never silently overrides architecture.

Architecture changes require an ADR.

---

# 3. Core Architecture

## 3.1 Architectural style

Amazing Chance remains a modular monolith for the MVP.

Microservices must not be introduced unless:

- a concrete scaling or ownership problem exists;
- the operational cost is justified;
- transaction boundaries are documented;
- data ownership is explicit;
- an ADR approves the extraction.

## 3.2 Module ownership

Every business entity and lifecycle belongs to exactly one module.

Examples:

| Entity or lifecycle | Owner |
|---|---|
| User account | Users |
| Authentication session | Auth |
| Purchase | Purchases |
| Payment | Payments |
| Ticket allocation and issuance | Tickets |
| Draw lifecycle | Lottery Draws |
| Snapshot | Snapshot |
| Randomness evidence | Randomness |
| Winner selection | Winners |
| Prize | Prizes |
| Payout | Payouts |
| Ledger transaction | Ledger |
| Audit record | Audit |

A module may read another module’s stable data when necessary.

A module must not change another module’s business state directly through Prisma.

Lifecycle changes must occur through explicit application commands.

## 3.3 Layering

Preferred backend flow:

```text
Controller
↓
Application Service
↓
Domain Rules
↓
Repository or Prisma Adapter
↓
PostgreSQL
```

Controllers must:

- validate transport input;
- authenticate and authorize;
- delegate;
- return transport responses.

Controllers must not contain business rules.

Business logic must not depend on HTTP.

---

# 4. PostgreSQL and Prisma Standards

## 4.1 Source of truth

PostgreSQL is the authoritative store for:

- money;
- purchases;
- payments;
- tickets;
- draw state;
- snapshots;
- randomness evidence;
- winners;
- prizes;
- payouts;
- ledger;
- audit history.

Redis must never become a financial or lottery source of truth.

## 4.2 Money

All monetary values use integer minor units.

Example:

```text
USD 1.00 → 100
```

Required type:

```text
BigInt
```

Forbidden:

- floating-point money;
- client-calculated totals;
- silently rounded financial values.

Currency must be stored with each historical financial record.

## 4.3 Migrations

Applied migrations are immutable.

Never edit a migration that may already have been applied.

All corrections use new additive migrations.

Production uses:

```text
prisma migrate deploy
```

Development uses:

```text
prisma migrate dev
```

Every migration must be tested:

- against an empty database;
- as an upgrade from the previous schema;
- with rollback or recovery planning where relevant.

## 4.4 Constraints

Critical invariants must be enforced in PostgreSQL where practical.

Examples:

- positive monetary amounts;
- positive ticket counts;
- valid date ordering;
- unique ticket per draw;
- unique ticket membership per snapshot;
- allocation ranges with valid boundaries;
- allocation percentages totaling 10,000 basis points;
- provider-scoped unique identifiers;
- status-dependent timestamps;
- balanced ledger transactions.

Application-only validation is insufficient for critical financial or lottery integrity.

## 4.5 Historical data

Financial and lottery history is append-only.

Do not physically delete or overwrite:

- confirmed payments;
- issued tickets;
- finalized snapshots;
- randomness evidence;
- winners;
- prizes;
- payouts;
- ledger postings;
- audit records.

Corrections use compensating records.

---

# 5. State Machine Standards

Critical lifecycle states must change through explicit commands.

Direct arbitrary status updates are forbidden.

Required state machines include:

- User;
- Purchase;
- Payment;
- Ticket;
- Draw;
- Snapshot;
- Prize;
- Payout.

Every transition must define:

- allowed source states;
- target state;
- required permission;
- preconditions;
- transaction boundary;
- idempotency behavior;
- state event;
- audit record;
- error code.

Stale or concurrent transitions must fail safely through conditional updates or row locking.

---

# 6. Idempotency and Concurrency

## 6.1 Client operations

Retryable client operations use client-supplied idempotency keys.

A server-generated random key does not protect against client retries.

Required behavior:

```text
same key + same request → original result
same key + different request → conflict
```

## 6.2 Provider events

Provider webhooks must be durable and idempotent.

Uniqueness must normally include the provider:

```text
(provider, providerEventId)
(provider, providerTransactionId)
```

## 6.3 Transactions

Changes that must succeed together belong in one PostgreSQL transaction.

External network calls must not remain open inside database transactions.

Critical transaction examples:

- payment confirmation;
- purchase transition;
- financial allocation;
- ledger postings;
- ticket-range reservation;
- ticket creation;
- state events;
- audit and outbox records.

## 6.4 Concurrency testing

Critical operations require concurrency tests.

Mandatory examples:

- refresh-token rotation;
- payment webhook replay;
- purchase cancellation versus payment confirmation;
- draw closure versus purchase creation;
- ticket-range allocation;
- snapshot finalization;
- payout idempotency.

---

# 7. Authentication and Authorization

## 7.1 Passwords

Passwords use Argon2.

Raw passwords and password hashes must never be logged.

External clients must never submit password hashes.

Password creation and replacement must pass through one approved hashing service.

## 7.2 Tokens

Access and refresh tokens use separate secrets.

Refresh tokens are stored only as hashes.

Access tokens are short-lived.

Every protected request must confirm current account eligibility:

```text
status = ACTIVE
emailVerifiedAt IS NOT NULL
```

Suspending or closing a user revokes active refresh sessions.

## 7.3 Authorization

Authorization is deny-by-default.

Administrative operations require explicit permissions.

Authentication alone is never sufficient for privileged actions.

Privileged accounts require MFA before production use.

High-risk actions may require step-up authentication.

## 7.4 Sensitive endpoints

Authentication and recovery endpoints require rate limiting.

Examples:

- register;
- login;
- refresh;
- forgot password;
- resend verification;
- reset password.

Rate-limit responses must not reveal whether an account exists.

---

# 8. API Standards

## 8.1 Versioning

Production APIs use a versioned prefix:

```text
/api/v1
```

## 8.2 Validation

Global validation must retain:

```text
whitelist = true
forbidNonWhitelisted = true
transform = true
```

Identifiers must use consistent validation such as `ParseUUIDPipe`.

Request body and pagination limits must be explicit.

## 8.3 Errors

API errors use stable machine-readable codes.

Examples:

```text
AUTH_INVALID_CREDENTIALS
AUTH_PERMISSION_DENIED
PURCHASE_INVALID_STATE
DRAW_INVALID_STATE
PAYMENT_AMOUNT_MISMATCH
RATE_LIMITED
```

Never expose:

- stack traces;
- raw Prisma errors;
- provider secrets;
- internal SQL details.

## 8.4 Swagger

Swagger is disabled by default in production or protected through authentication and network restriction.

Swagger protection never replaces endpoint authorization.

---

# 9. Payment and Webhook Standards

Payment truth comes only from independently verified provider evidence.

Browser redirects never confirm payment.

Webhook processing must verify:

- signature;
- exact raw body;
- timestamp or freshness;
- provider account;
- event ID;
- replay status;
- purchase reference;
- amount;
- currency;
- expected merchant.

A failed verification causes no business-state change.

Payment confirmation must be idempotent and transactionally connected to:

- purchase state;
- allocation rule;
- ledger;
- ticket issuance;
- audit;
- outbox.

---

# 10. Ticket, Snapshot, Randomness, and Winner Standards

## 10.1 Tickets

Tickets are created only after confirmed payment.

One purchase receives at most one ticket-allocation range.

Ticket numbers are unique within a draw.

Allocation uses PostgreSQL-atomic sequencing.

Exact ticket count must equal the paid quantity.

## 10.2 Snapshot

A finalized snapshot is immutable.

A ticket may appear at most once in one snapshot.

No ticket may be added after finalization.

Snapshot format and hash algorithm are versioned.

## 10.3 Randomness

Randomness must be independently verifiable.

Provider evidence must be:

- authenticated;
- immutable;
- normalized;
- hashed;
- linked to the draw;
- publicly verifiable where permitted.

Random positions must be:

- integers;
- unique where required;
- in range;
- exact in count.

## 10.4 Winners

Winner selection is deterministic and versioned.

Given the same:

```text
snapshot
randomness evidence
algorithm version
```

every verifier must produce the same result.

Manual winner replacement is prohibited.

---

# 11. Ledger Standards

Ledger accounting is double-entry.

For every ledger transaction:

```text
sum(debits) = sum(credits)
```

Required properties:

- positive posting amounts;
- at least two postings;
- one currency per transaction;
- append-only records;
- database-level balance validation;
- idempotent business references;
- compensating transactions for corrections.

Application-only balance checks are not sufficient.

---

# 12. Logging, Audit, and Privacy

## 12.1 Correlation

Every request receives:

```text
requestId
correlationId
```

Correlation IDs propagate through:

- API logs;
- state events;
- webhooks;
- outbox events;
- workers;
- payment operations;
- draw operations;
- audit records.

## 12.2 Redaction

Never log:

- passwords;
- password hashes;
- access tokens;
- refresh tokens;
- verification tokens;
- reset tokens;
- cookies;
- authorization headers;
- API keys;
- webhook secrets or signatures;
- private keys;
- full payment-card data.

## 12.3 Audit history

Administrative, financial, and draw actions must record:

- actor;
- target;
- action;
- previous state;
- new state;
- reason;
- timestamp;
- correlation ID;
- result.

Audit history must be append-only and access-controlled.

## 12.4 Personal data

Collect and retain only necessary personal data.

Define retention and access rules before storing:

- IP addresses;
- device metadata;
- KYC data;
- payout identity information;
- provider payloads.

---

# 13. Testing Standards

## 13.1 Required layers

The backend test suite includes:

- unit tests;
- integration tests;
- concurrency tests;
- API end-to-end tests.

## 13.2 Mandatory critical coverage

Before a feature is complete, tests must cover applicable cases:

- correct path;
- invalid input;
- unauthorized access;
- forbidden access;
- duplicate request;
- retry;
- concurrent request;
- stale state;
- transaction rollback;
- provider failure;
- database constraint failure.

## 13.3 Test isolation

Tests must never connect to production data.

Integration tests use a dedicated test PostgreSQL instance or isolated container.

Each test suite must clean or recreate state deterministically.

## 13.4 Definition of done

Critical code is not complete without tests.

A feature with no automated tests remains incomplete regardless of manual success.

---

# 14. Build and Dependency Standards

## 14.1 Runtime versions

The project must explicitly pin:

- Node.js;
- pnpm;
- TypeScript.

Local development and CI use the same supported runtime family.

## 14.2 Package management

Use the workspace lockfile.

CI installs using:

```text
pnpm install --frozen-lockfile
```

Dependency changes require lockfile review.

## 14.3 Linting

Use ESLint 9 flat configuration or another explicitly approved tool.

`next lint` is prohibited for Next.js 16.

Lint commands must work locally and in CI.

## 14.4 Build artifacts

Production artifacts are created by CI.

Never deploy:

- local `dist`;
- local `.next`;
- developer `node_modules`;
- untracked source directories.

## 14.5 Dependency introduction

Add a dependency only when:

- existing platform APIs are insufficient;
- the package is maintained;
- security risk is acceptable;
- transitive cost is understood;
- licensing is compatible;
- the package is used for a real requirement.

---

# 15. Operations Standards

## 15.1 Environments

Maintain separate:

- local;
- test;
- staging;
- production

configurations and credentials.

## 15.2 Networking

Production PostgreSQL and Redis are private.

They must not be exposed to the public internet.

## 15.3 Secrets

Production secrets come from protected secret management.

Secrets must:

- be cryptographically strong;
- differ by environment;
- support rotation;
- never be committed;
- never be included in archives.

## 15.4 Containers

Production containers should:

- run as non-root;
- use minimal runtime images;
- use multi-stage builds;
- contain no development tooling;
- define resource limits;
- use read-only filesystems where practical.

## 15.5 Health

Separate:

```text
/live
/ready
```

Liveness checks process health.

Readiness checks required dependencies.

## 15.6 Backups

Production backups are:

- encrypted;
- access-controlled;
- monitored;
- periodically restored in tests;
- protected from ordinary application deletion.

---

# 16. Git Standards

## 16.1 Branches

Work is performed on purpose-specific branches.

Examples:

```text
docs-architecture
rep-001-test-foundation
sec-001-api-lockdown
```

## 16.2 Commits

Commits must represent logical, reviewable changes.

Preferred format:

```text
type(scope): description
```

Examples:

```text
test(api): add Jest foundation
fix(auth): reject suspended users during refresh
docs(audits): update remediation status
```

Do not combine unrelated refactors, migrations, and feature changes in one commit.

## 16.3 Generated files and secrets

Never commit:

- `.env`;
- secrets;
- `node_modules`;
- `dist`;
- `.next`;
- coverage;
- local logs;
- temporary archives.

## 16.4 Review

Critical changes require review against:

- architecture;
- security;
- data integrity;
- tests;
- migration safety;
- remediation acceptance criteria.

---

# 17. Documentation Standards

Each document has one responsibility.

Do not duplicate content.

Reference the authoritative document instead.

Document categories:

```text
Vision and product
Architecture
Engineering standards
ADR
Audits
Remediation plan
Module documentation
Operational runbooks
```

Audits are historical baselines and should not be rewritten to hide resolved issues.

Resolved work is tracked in `REMEDIATION_PLAN.md`.

Architecture changes require ADRs.

Documentation must be updated in the same change as affected code.

---

# 18. Required Development Workflow

Every meaningful change follows this process:

```text
1. Identify remediation item or approved feature
2. Confirm invariants and ownership
3. Confirm security implications
4. Define transaction and idempotency behavior
5. Define tests
6. Implement
7. Run lint, typecheck, build, tests
8. Update documentation
9. Review
10. Commit
11. Mark remediation item complete
```

Do not start implementation before steps 1–5 are clear.

---

# 19. Prohibited Practices

The following are prohibited unless explicitly approved by ADR:

- public administrative CRUD without authorization;
- accepting password hashes from clients;
- storing money as floating point;
- confirming payment from browser redirects;
- manual ticket issuance;
- manual winner selection;
- direct arbitrary status updates;
- logging secrets or tokens;
- editing applied migrations;
- physical deletion of financial or lottery history;
- application-only ledger balance validation;
- Redis as a financial source of truth;
- creating empty modules without defined invariants;
- introducing microservices for appearance or fashion;
- deploying local Docker Compose as production infrastructure;
- writing critical code without tests.

---

# 20. Enforcement

A pull request must not be merged when it violates these standards.

Exceptions require:

- written justification;
- risk assessment;
- explicit owner approval;
- ADR where architectural;
- remediation deadline where temporary.

These standards must be reviewed after major architecture changes, security incidents, or production-readiness reviews.
