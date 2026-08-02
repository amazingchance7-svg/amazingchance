# Amazing Chance — Backend Modules Audit

**Audit baseline:** Backend source code located in `apps/api/src`

**Scope:** NestJS application architecture, module boundaries, dependency graph, business responsibilities, maintainability, scalability and production readiness.

**Status:** Architecture baseline.

---

# Executive Summary

The Amazing Chance backend follows a modular monolith architecture implemented with NestJS.

At the time of this audit the project already demonstrates a good separation between business modules and infrastructure modules. The overall direction is correct and suitable for a transactional financial platform.

However, the current implementation should still be considered a foundation rather than a production-ready backend.

Several critical business modules defined by the architecture documentation have not yet been implemented, and some existing modules still contain responsibilities that will need to be redistributed as the system grows.

Overall backend maturity:

**7.0 / 10**

---

# Current Module Map

Current backend modules:

```
app
auth
common
config
email
health
lottery-draws
prisma
purchases
tickets
users
```

The current architecture is intentionally compact and avoids unnecessary fragmentation.

This is appropriate for the current stage of development.

---

# High-Level Dependency Graph

```
                AppModule
                    │
     ┌──────────────┼──────────────┐
     │              │              │
  Config         Prisma        Health
     │              │
     │              │
 ┌───┴────┬─────────┴─────────┐
 │        │                   │
Auth    Users            LotteryDraws
 │        │                   │
 │        │                   │
 └────────┼──────────────┐
          │              │
      Purchases      Tickets
          │
          │
        Email
```

Current dependency graph is simple and understandable.

No obvious cyclic module dependencies are visible from the current architecture.

---

# Architecture Assessment

Current architectural style:

- Modular Monolith

Framework:

- NestJS

ORM:

- Prisma

Database:

- PostgreSQL

Cache:

- Redis (planned)

Current assessment:

✓ Good module separation

✓ Small dependency graph

✓ Clear project layout

✓ Easy future extraction

---

# Module Classification

Business modules:

- Users
- Purchases
- Tickets
- LotteryDraws

Infrastructure modules:

- Auth
- Prisma
- Config
- Common
- Email
- Health

Current separation is appropriate.

Business modules mostly represent business capabilities rather than technical layers.

---

# AppModule

Purpose:

Application composition root.

Responsibilities:

- register modules
- configure global providers
- initialize application

Current assessment:

AppModule is appropriately lightweight.

Business logic should never be implemented here.

Current score:

9 / 10

---

# Prisma Module

Purpose:

Database access.

Responsibilities:

- PrismaClient lifecycle
- connection management
- transaction support

Positive findings:

- isolated infrastructure module
- reusable service
- clean responsibility

Recommendations:

- keep Prisma isolated
- never expose ORM models directly to controllers
- all transactions should remain inside application services

Current score:

9 / 10

---

# Config Module

Purpose:

Configuration management.

Responsibilities:

- environment loading
- configuration validation
- centralized application settings

Assessment:

Configuration should remain immutable after application startup.

Current score:

8 / 10

---

# Common Module

Purpose:

Shared infrastructure.

Expected contents:

- guards
- interceptors
- decorators
- filters
- pipes
- utilities

Risk:

The Common module must never become a dumping ground for unrelated helpers.

Shared code should exist only when genuinely reusable.

Current score:

8 / 10

---

# Health Module

Purpose:

Health endpoints.

Expected responsibilities:

- liveness
- readiness
- dependency health

Production recommendation:

Future readiness endpoint should verify:

- PostgreSQL connectivity
- Redis connectivity
- Randomness provider availability
- Email provider availability

Current score:

8 / 10
---

# Auth Module

Purpose:

- registration;
- authentication;
- access token issuance;
- refresh token rotation;
- email verification;
- password reset;
- logout.

The Auth module is currently the strongest implemented business-support module in the backend.

## Positive findings

- Argon2 is used for password hashing.
- Access and refresh tokens use separate secrets.
- Refresh tokens are stored as hashes.
- Refresh token rotation is implemented.
- Repeated use of an already revoked refresh token is rejected.
- Email verification and password reset tokens are one-time and hashed.
- Password reset invalidates existing refresh tokens.
- Login checks that the user is active and email-verified.
- Forgot-password and resend-verification responses reduce account enumeration risk.

## Findings

### AUTH-001 — Refresh does not enforce current user status

During refresh token rotation, user status and email verification state are loaded but not enforced.

A suspended or closed user may continue refreshing a valid session.

**Required remediation:**

- reject refresh for users that are not `ACTIVE`;
- reject refresh for users without verified email;
- revoke all refresh tokens when a user is suspended or closed.

**Priority:** P0

---

### AUTH-002 — JWT validation does not enforce active account state

The JWT strategy verifies the token and loads the user, but does not reject:

- suspended users;
- closed users;
- users that are no longer verified.

A previously issued access token may therefore remain valid until expiration.

**Required remediation:**

Create a dedicated authentication lookup such as:

```text
findActiveForAuthentication(userId)
```

It must verify:

```text
status = ACTIVE
emailVerifiedAt IS NOT NULL
```

**Priority:** P0

---

### AUTH-003 — Registration side effects are not atomic

The current flow is:

```text
create user
create verification token
send email
```

If email delivery fails, the database changes remain committed while the API may return an error.

**Required remediation:**

Use a transactional outbox:

```text
transaction:
- create user
- create verification token
- create email outbox event

after commit:
- worker sends email
```

**Priority:** P1

---

### AUTH-004 — Refresh token family reuse detection is incomplete

Current rotation prevents concurrent reuse of one refresh token, but does not track a complete token family.

A stolen historical token causes rejection but does not automatically invalidate the entire related session.

**Recommended future model:**

- familyId;
- parentTokenId;
- replacedByTokenId;
- reuseDetectedAt;
- session-wide revocation.

**Priority:** P2

---

### AUTH-005 — Logout behavior and API documentation differ

Logout is effectively idempotent and does not validate that the supplied token is a valid JWT before attempting revocation.

This is not inherently unsafe, but the API documentation must reflect actual behavior.

**Priority:** P3

---

## Auth assessment

| Area | Score |
|---|---:|
| Password security | 9 / 10 |
| Token storage | 8 / 10 |
| Refresh rotation | 8 / 10 |
| Account-state enforcement | 4 / 10 |
| Recovery flows | 7 / 10 |
| Production readiness | 6 / 10 |

Overall Auth score:

**7 / 10**

---

# Users Module

Purpose:

- user persistence;
- user retrieval;
- account status management;
- user data access for authentication.

## Positive findings

- Public user selection excludes password hashes.
- User lookup responsibilities are centralized.
- User status is explicit.
- Email verification state is stored explicitly.

## Critical findings

### USER-001 — UsersController is publicly accessible

Administrative user endpoints are not protected by authentication or authorization.

Publicly accessible operations include:

```text
GET /users
POST /users
PATCH /users/:id/status
DELETE /users/:id
```

This exposes personal information and administrative operations.

**Required remediation:**

- remove public access;
- require JWT authentication;
- require explicit administrative permissions;
- separate public self-service endpoints from administrative endpoints.

**Priority:** P0

---

### USER-002 — Public user creation bypasses password hashing

`POST /users` accepts a field named `passwordHash`, but the value is not guaranteed to be a real password hash.

A client may submit plaintext and the service may persist it directly.

This bypasses the secure registration flow in Auth.

**Required remediation:**

- remove the public endpoint;
- ordinary users must be created only through `POST /auth/register`;
- administrative creation must use a separate internal use case;
- raw password hashes must never be accepted from external clients.

**Priority:** P0

---

### USER-003 — No role or permission model exists

The backend cannot distinguish:

- customer;
- support agent;
- draw operator;
- financial administrator;
- auditor;
- super administrator.

This prevents safe protection of administrative endpoints.

**Required remediation:**

Introduce a role and permission model before implementing an admin interface.

The preferred direction is permission-based authorization, optionally grouped by role.

**Priority:** P0

---

### USER-004 — Account status transitions are unrestricted

The status endpoint can assign any allowed enum value without enforcing transition rules.

This may allow:

```text
PENDING_VERIFICATION → ACTIVE
CLOSED → ACTIVE
SUSPENDED → PENDING_VERIFICATION
```

without domain validation.

**Required remediation:**

Create an explicit user-state transition service.

Each transition must define:

- allowed source states;
- required permission;
- reason;
- actor;
- audit record;
- refresh-token revocation behavior.

**Priority:** P0

---

### USER-005 — Physical deletion is unsuitable for business history

The module physically deletes users through Prisma.

For a financial and lottery platform this conflicts with:

- purchase history;
- tickets;
- prizes;
- payouts;
- audit requirements;
- legal retention.

Foreign-key restrictions may prevent some deletions, but failures may surface as generic server errors.

**Required remediation:**

Replace physical deletion with:

```text
status = CLOSED
closedAt
anonymizedAt
```

Introduce a controlled anonymization process where legally required.

**Priority:** P1

---

## Users assessment

| Area | Score |
|---|---:|
| Data selection | 8 / 10 |
| Domain model | 6 / 10 |
| Authorization | 1 / 10 |
| Lifecycle safety | 3 / 10 |
| Production readiness | 2 / 10 |

Overall Users score:

**3 / 10**

---

# Email Module

Purpose:

- development delivery of verification links;
- development delivery of password-reset links.

## Current state

The current implementation is a development transport.

It logs generated URLs instead of sending email through a provider.

## Critical finding

### EMAIL-001 — Sensitive tokens are written to logs

Verification and password-reset tokens are included in application logs.

Password-reset tokens provide temporary authority to change a user password.

Logs may be accessible to:

- developers;
- administrators;
- monitoring providers;
- container platforms;
- support personnel.

**Required remediation:**

- never log raw tokens in production;
- ensure development transport cannot run in production;
- redact sensitive query parameters;
- introduce a real email adapter;
- deliver email through an outbox worker.

**Priority:** P0

---

### EMAIL-002 — Delivery failures are not durable

Email sending is executed as a direct side effect after database changes.

A temporary provider failure can leave a user unable to complete registration or password recovery.

**Required remediation:**

Use transactional outbox and retryable delivery.

**Priority:** P1

---

## Email assessment

| Area | Score |
|---|---:|
| Module isolation | 7 / 10 |
| Development usability | 7 / 10 |
| Secret handling | 2 / 10 |
| Delivery reliability | 2 / 10 |
| Production readiness | 2 / 10 |

Overall Email score:

**4 / 10**

---

# Lottery Draws Module

Purpose:

- create lottery draws;
- list and retrieve draws;
- update draw configuration;
- delete eligible draft or cancelled draws.

## Positive findings

- Draw lifecycle is represented by an explicit enum.
- Pagination and filtering exist.
- Draw sequence number is unique by type.
- Deletion already checks some dependent data.
- Purchase records retain price and currency snapshots.

## Critical findings

### DRAW-001 — Draw mutation endpoints are public

The following operations lack administrative authorization:

```text
POST /lottery-draws
PATCH /lottery-draws/:id
DELETE /lottery-draws/:id
```

An unauthenticated actor could potentially create, modify, cancel or delete draws.

**Required remediation:**

- protect all draw mutations;
- require specific permissions;
- log actor and correlation ID;
- separate public read endpoints from administrative commands.

**Priority:** P0

---

### DRAW-002 — No draw state machine exists

The update DTO can directly set draw status.

This permits invalid transitions such as:

```text
COMPLETED → SALES_OPEN
DRAWING → SCHEDULED
PUBLISHED → CANCELLED
```

**Required remediation:**

Introduce explicit commands:

```text
scheduleDraw
openSales
closeSales
finalizeSnapshot
startDrawing
completeDraw
publishDraw
cancelDraw
```

Each command must validate:

- current state;
- required timestamps;
- dependencies;
- permissions;
- audit metadata.

**Priority:** P1

---

### DRAW-003 — Sequence number generation has a race condition

The current sequence generation reads the latest value and increments it.

Two concurrent requests may calculate the same next value.

The database unique constraint prevents duplication, but one request may fail with a generic error.

**Required remediation options:**

- PostgreSQL sequence;
- dedicated draw sequence table;
- serializable transaction with retry;
- advisory lock;
- controlled retry on uniqueness conflict.

**Priority:** P1

---

### DRAW-004 — Financial draw parameters remain mutable after sales start

Fields such as these may be changed without checking draw lifecycle:

```text
ticketPriceMinor
currency
winnerCount
scheduledDrawAt
participationYear
```

After sales open, these values must become partially or fully immutable.

**Required remediation:**

Define field mutability by state.

Example:

| Field | Before sales | During sales | After close |
|---|---:|---:|---:|
| ticket price | editable | immutable | immutable |
| currency | editable | immutable | immutable |
| winner count | editable | restricted | immutable |
| draw date | editable | controlled | controlled |
| participation year | editable | immutable | immutable |

**Priority:** P1

---

### DRAW-005 — Physical deletion conflicts with auditability

Even when a draw has no purchases or tickets, deleting historical draw records reduces traceability.

**Required remediation:**

Prefer lifecycle states such as:

```text
CANCELLED
ARCHIVED
```

Physical deletion should be limited to local development fixtures or explicitly approved data cleanup.

**Priority:** P2

---

## Lottery Draws assessment

| Area | Score |
|---|---:|
| Basic CRUD | 7 / 10 |
| Lifecycle design | 3 / 10 |
| Authorization | 1 / 10 |
| Concurrency safety | 4 / 10 |
| Production readiness | 3 / 10 |

Overall Lottery Draws score:

**4 / 10**

---

# Purchases Module

Purpose:

- create ticket purchases;
- expose user-owned purchase history;
- retrieve one user-owned purchase;
- cancel unpaid purchases.

## Positive findings

- The controller is protected by JWT.
- Object-level authorization uses both purchase ID and user ID.
- Ticket price and currency are copied from the draw.
- Total price is calculated server-side.
- User status and email verification are checked.
- Draw status and sales period are checked.
- Purchase state events are created.
- Purchase expiration time is stored.
- Requested ticket count is bounded.

## Critical findings

### PURCHASE-001 — Idempotency key is generated by the server

A server-generated random idempotency key does not protect against repeated client requests.

Scenario:

```text
client submits purchase
server creates purchase
response is lost
client retries
server generates another key
second purchase is created
```

**Required remediation:**

- accept `Idempotency-Key` from the client;
- scope uniqueness by user and operation;
- return the original response on retry;
- store request fingerprint where appropriate.

**Priority:** P1

---

### PURCHASE-002 — Purchase creation races with draw closure

The draw is checked before the purchase transaction.

The draw can be closed between validation and purchase creation.

**Required remediation:**

Re-check and lock the draw inside the transaction.

Possible mechanism:

```text
SELECT ... FOR UPDATE
```

or an equivalent conditional state operation.

**Priority:** P1

---

### PURCHASE-003 — Purchase cancellation races with payment confirmation

The current cancellation flow reads the purchase state and updates it later without a status condition.

A payment webhook may confirm payment between these steps.

Possible contradictory result:

```text
payment = confirmed
purchase = cancelled
```

**Required remediation:**

Use an atomic conditional update:

```text
UPDATE purchase
WHERE id = ?
AND userId = ?
AND status IN (CREATED, PAYMENT_PENDING)
```

Only one valid transition may win.

**Priority:** P0 before payments**

---

### PURCHASE-004 — Expiration is stored but not executed

Purchases receive `expiresAt`, but no worker or scheduler transitions them to `EXPIRED`.

Purchases may remain indefinitely in an open state.

**Required remediation:**

Introduce a durable expiration worker.

The transition must:

- be idempotent;
- use conditional update;
- create state event;
- avoid expiring a confirmed purchase.

**Priority:** P1

---

### PURCHASE-005 — No centralized purchase state machine exists

Status transitions are distributed through service methods and future payment code may update purchase state directly.

**Required remediation:**

Introduce a dedicated purchase transition service with explicit allowed transitions.

Example:

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

Every transition must create a state event.

**Priority:** P1

---

## Purchases assessment

| Area | Score |
|---|---:|
| Request validation | 8 / 10 |
| Ownership authorization | 8 / 10 |
| Financial snapshot | 8 / 10 |
| Concurrency safety | 4 / 10 |
| Idempotency | 3 / 10 |
| Lifecycle completeness | 4 / 10 |
| Production readiness | 4 / 10 |

Overall Purchases score:

**6 / 10**

---

# Tickets Module

Purpose:

- allocate ticket-number ranges;
- create ticket records;
- expose ticket ownership;
- support snapshot generation and public verification.

## Current state

The module currently contains:

```text
ticket-allocation.service.ts
tickets.module.ts
```

`TicketsModule` is empty.

`TicketAllocationService` is not registered in the dependency-injection container and is not used by any completed business flow.

## Positive finding

The ticket range allocation algorithm is technically strong.

It uses PostgreSQL atomic update semantics:

```text
UPDATE ticket_sequences
SET nextNumber = nextNumber + ticketCount
RETURNING allocated range
```

This ensures that concurrent allocations for the same draw do not overlap.

The service also supports one allocation per purchase.

## Findings

### TICKET-001 — TicketsModule is not operational

The module:

- is not imported by AppModule;
- has no registered providers;
- exports no services;
- has no completed integration.

**Required remediation:**

Register the allocation and ticket services and integrate them only through a confirmed-payment transaction.

**Priority:** P1

---

### TICKET-002 — Ticket row creation is not implemented

Range reservation exists, but the complete flow does not yet:

- create individual ticket records;
- validate exact row count;
- transition purchase state;
- create ledger records;
- create audit events.

**Priority:** P1

---

### TICKET-003 — Ticket allocation is not connected to payment confirmation

The intended business flow is incomplete:

```text
payment confirmed
→ reserve range
→ create tickets
→ create financial allocation
→ complete purchase
```

This entire operation must execute in one PostgreSQL transaction.

**Priority:** P1

---

### TICKET-004 — No public ticket verification use case exists

The schema supports public ticket identifiers, but no completed service or endpoint provides verifiable lookup.

This should be implemented only after ticket issuance and draw snapshot rules are finalized.

**Priority:** P2

---

## Tickets assessment

| Area | Score |
|---|---:|
| Allocation algorithm | 9 / 10 |
| Module integration | 1 / 10 |
| Ticket issuance | 1 / 10 |
| Public verification | 0 / 10 |
| Production readiness | 1 / 10 |

Overall Tickets score:

**3 / 10**
---

# Health Module

Purpose:

- expose application health;
- verify critical dependencies;
- support orchestration and monitoring.

## Positive findings

- The module already checks PostgreSQL connectivity.
- The implementation is simple and easy to understand.
- The current database probe is appropriate as a readiness check.

## Finding

### HEALTH-001 — Liveness and readiness are not separated

The current health endpoint combines process health and dependency health.

A short PostgreSQL outage should not necessarily cause the application process to be treated as dead.

**Required remediation:**

Introduce separate endpoints:

```text
/live
/ready
```

`/live` should verify that the process is running.

`/ready` should verify dependencies required to serve traffic.

Future readiness checks may include:

- PostgreSQL;
- Redis;
- job worker availability;
- required configuration.

External providers such as email and randomness should be evaluated carefully because a temporary third-party outage should not always remove the API from service.

**Priority:** P2

---

## Health assessment

| Area | Score |
|---|---:|
| Simplicity | 9 / 10 |
| Database readiness | 8 / 10 |
| Operational separation | 5 / 10 |
| Production readiness | 6 / 10 |

Overall Health score:

**7 / 10**

---

# Config Module

Purpose:

- load environment configuration;
- validate required variables;
- provide runtime settings.

## Positive findings

The current environment validation covers:

- `NODE_ENV`;
- `API_PORT`;
- `DATABASE_URL`;
- `REDIS_URL`;
- JWT access secret;
- JWT refresh secret;
- JWT expiration settings.

The application fails early when essential configuration is missing.

This is correct behavior.

## Findings

### CONFIG-001 — Some used variables are not validated

The code uses variables including:

```text
WEB_URL
EMAIL_VERIFICATION_TTL_SECONDS
PASSWORD_RESET_TTL_SECONDS
```

but the main environment validation does not fully validate them.

**Required remediation:**

Every environment variable used by application code must be represented in one typed configuration schema.

**Priority:** P1

---

### CONFIG-002 — JWT secret strength is not enforced

The validation currently confirms presence but not adequate entropy.

Values such as this may technically pass:

```text
JWT_ACCESS_SECRET=123
```

**Required remediation:**

Require strong secrets.

Recommended production baseline:

- at least 32 random bytes;
- separate access and refresh secrets;
- no checked-in values;
- rotation procedure documented.

**Priority:** P0 before production**

---

### CONFIG-003 — Configuration access is inconsistent

The project uses both:

```text
ConfigService
process.env
```

in different parts of the backend.

This creates inconsistent validation and testing behavior.

**Required remediation:**

Use a typed configuration layer consistently.

`process.env` should be accessed only during configuration bootstrap.

**Priority:** P2

---

## Config assessment

| Area | Score |
|---|---:|
| Required-variable validation | 8 / 10 |
| Secret validation | 4 / 10 |
| Consistency | 6 / 10 |
| Production readiness | 6 / 10 |

Overall Config score:

**6 / 10**

---

# Common Infrastructure

Current shared infrastructure includes:

- constants;
- DTOs;
- exception filter;
- logging interceptor;
- response-envelope interceptor;
- response models;
- shared types;
- identifier utility.

## Positive findings

### Exception handling

The global exception filter:

- returns a consistent error structure;
- hides internal exception details from clients;
- logs server-side failures;
- distinguishes expected HTTP exceptions from unexpected errors.

This is a good foundation.

### Request validation

Global validation uses:

```text
whitelist = true
forbidNonWhitelisted = true
transform = true
```

This reduces mass-assignment and malformed-request risks.

### Logging

The interceptor records:

- HTTP method;
- path;
- status;
- duration.

It does not appear to log complete request bodies by default, which is safer.

## Findings

### COMMON-001 — No request or correlation identifier

Logs do not consistently include a request ID or correlation ID.

This makes it difficult to trace:

```text
client request
→ API command
→ database transaction
→ webhook
→ outbox event
→ worker
```

**Required remediation:**

Generate or accept a correlation ID for every request.

Propagate it through:

- logs;
- audit records;
- state events;
- outbox events;
- payment operations;
- draw operations.

**Priority:** P1

---

### COMMON-002 — Logging is not sufficiently structured

Human-readable logs are useful during development but insufficient for production observability.

**Required remediation:**

Use structured JSON logs with fields including:

```text
timestamp
level
service
environment
requestId
correlationId
userId
method
path
status
duration
errorCode
```

Sensitive values must be redacted.

**Priority:** P2

---

### COMMON-003 — Response envelope may conflict with 204 responses

The response interceptor wraps normal responses, while some endpoints return `204 No Content`.

A 204 response must not contain a body.

**Required remediation:**

Skip response wrapping for:

- status 204;
- streams;
- file downloads;
- manually handled responses.

**Priority:** P3

---

### COMMON-004 — Shared directory may become an uncontrolled dependency source

The `common` directory is currently manageable, but shared directories often become dumping grounds.

**Required rule:**

A utility belongs in `common` only when:

- it is genuinely cross-module;
- it contains no business ownership;
- it has stable semantics;
- it does not create hidden coupling.

**Priority:** P3

---

## Common infrastructure assessment

| Area | Score |
|---|---:|
| Validation | 9 / 10 |
| Exception handling | 8 / 10 |
| Logging foundation | 6 / 10 |
| Traceability | 3 / 10 |
| Production readiness | 6 / 10 |

Overall Common score:

**7 / 10**

---

# Prisma Module Boundary

The Prisma infrastructure itself is well isolated, but business services frequently access Prisma directly.

Current examples include:

```text
PurchasesService → User tables
PurchasesService → LotteryDraw tables
LotteryDrawsService → draw persistence
UsersService → user persistence
```

For the current MVP this is acceptable, but it creates a future boundary risk.

## Boundary rule

Modules may perform simple read-only queries across stable data when necessary.

Modules must not directly change another module's business lifecycle.

Examples of state that must be owned by explicit module commands:

```text
User status
Purchase status
Payment status
Ticket status
Draw status
Prize status
Payout status
```

Future code must not evolve into:

```text
PaymentsService directly updates Purchase
TicketsService directly updates Draw
DrawService directly updates Prize
```

without a documented application contract.

---

# Module Boundary Findings

### BOUNDARY-001 — Direct Prisma access can bypass domain rules

As more modules are added, direct table updates may bypass:

- state-machine validation;
- audit events;
- authorization;
- idempotency;
- side effects;
- ledger entries.

**Required remediation:**

Introduce explicit application services for lifecycle-changing commands.

Examples:

```text
PurchaseTransitionService
DrawLifecycleService
UserStatusService
PaymentConfirmationService
PrizeSettlementService
```

**Priority:** P1

---

### BOUNDARY-002 — Infrastructure and domain terminology are not fully separated

Some current module names describe technical concerns, while future documentation sometimes treats them as business modules.

For example, Auth is primarily an identity/security capability rather than a core lottery business aggregate.

**Required remediation:**

Maintain a clear classification:

```text
Business modules
Identity/security modules
Infrastructure modules
Cross-cutting modules
```

**Priority:** P3

---

# Actual Implemented Business Flow

## Registration

```text
POST /auth/register
    ↓
AuthService
    ↓
hash password with Argon2
    ↓
UsersService.create
    ↓
create verification token
    ↓
EmailService logs verification URL
```

## Email verification

```text
POST /auth/verify-email
    ↓
validate one-time token
    ↓
mark token used
    ↓
PENDING_VERIFICATION → ACTIVE
```

## Login

```text
POST /auth/login
    ↓
verify password
    ↓
verify ACTIVE status
    ↓
verify email
    ↓
issue access and refresh tokens
```

## Refresh

```text
POST /auth/refresh
    ↓
verify refresh JWT
    ↓
find hashed token
    ↓
atomically revoke old token
    ↓
issue replacement token
```

## Purchase creation

```text
POST /purchases
    ↓
JWT authentication
    ↓
verify user state
    ↓
verify draw and sales window
    ↓
calculate total server-side
    ↓
create Purchase(CREATED)
    ↓
create PurchaseStateEvent
```

## Current flow termination

The implemented business flow stops after purchase creation.

The following capabilities are not yet connected:

```text
payment session creation
payment webhook verification
payment confirmation
purchase state transition
ticket range allocation
ticket row creation
ledger allocation
snapshot generation
randomness request
winner selection
prize creation
payout
refund
```

This is expected for an early foundation, but documentation and API exposure must not imply that the complete platform already exists.

---

# Missing Backend Modules

The target architecture requires modules or capabilities that are not yet implemented in backend code.

## Required before payments

```text
payments
payment-webhooks
idempotency
outbox
ledger
```

## Required before ticket issuance

```text
ticket issuance
purchase transition orchestration
expiration worker
```

## Required before real draws

```text
snapshot
randomness
draw execution
winner selection
public verification
audit
```

## Required before payouts

```text
prizes
payouts
reconciliation
refunds
```

These modules should not be created merely as empty folders.

Each one should be introduced only after:

- invariants are documented;
- ownership is defined;
- database constraints are decided;
- tests are designed;
- transaction boundaries are specified.

---

# Security Exposure Summary

The current backend contains administrative capabilities without an administrative authorization model.

## Publicly dangerous operations

```text
GET /users
POST /users
PATCH /users/:id/status
DELETE /users/:id

POST /lottery-draws
PATCH /lottery-draws/:id
DELETE /lottery-draws/:id
```

## Current consequences

An unauthenticated actor may potentially:

- enumerate users;
- obtain email addresses;
- create unsafe user records;
- change account status;
- delete eligible users;
- create draws;
- change draw dates;
- change ticket prices;
- open or close sales;
- cancel or delete draws.

## Production decision

The backend must not be exposed publicly before these endpoints are protected or removed.

---

# Concurrency and Transaction Summary

## Correct implementations

- one-time user token consumption uses conditional updates;
- refresh-token rotation uses atomic conditional revocation;
- ticket range reservation uses atomic PostgreSQL update;
- purchase creation stores price snapshots;
- purchase state events already exist.

## Unsafe or incomplete implementations

- draw sequence generation races;
- purchase creation races with sales closure;
- purchase cancellation races with payment confirmation;
- registration and email delivery are not durable;
- purchase expiration is not executed;
- payment-to-ticket transaction is not implemented;
- draw status transitions are not protected.

---

# Priority Remediation

## P0 — before any public deployment

1. Protect or remove all `UsersController` administrative endpoints.
2. Remove external acceptance of `passwordHash`.
3. Protect all draw mutation endpoints.
4. Introduce roles and permissions.
5. Enforce active/verified user state during JWT validation.
6. Enforce active/verified user state during token refresh.
7. Revoke refresh tokens when a user is suspended or closed.
8. Prevent raw verification and reset tokens from entering production logs.
9. Require strong JWT secrets.
10. Add tests for all existing critical authentication flows.

---

## P1 — before payment integration

1. Implement client-supplied idempotency.
2. Add purchase state-machine service.
3. Make cancellation an atomic conditional transition.
4. Re-check and lock draw state inside purchase transaction.
5. Implement durable purchase expiration.
6. Register and integrate `TicketsModule`.
7. Implement ticket row creation.
8. Define payment-confirmation transaction.
9. Introduce correlation IDs.
10. Define module command boundaries.
11. Add transactional outbox.
12. Add integration and concurrency tests.

---

## P2 — before first real draw

1. Introduce draw state machine.
2. Make financial draw fields immutable after sales open.
3. Fix concurrent draw sequence generation.
4. Replace physical draw deletion with archival lifecycle.
5. Implement snapshot module.
6. Implement normalized randomness evidence.
7. Implement deterministic winner selection.
8. Implement public verification.
9. Implement immutable audit trail.
10. Protect Swagger in production.

---

## P3 — platform hardening

1. Structured JSON logging.
2. Separate liveness and readiness.
3. Refresh-token family reuse detection.
4. API versioning.
5. Rate limiting.
6. Security headers.
7. Expired-token cleanup.
8. More explicit infrastructure/domain classification.
9. Shared packages only when real duplication appears.
10. Advanced monitoring and alerting.

---

# Module Scores

| Module | Architecture | Security | Completion | Production readiness |
|---|---:|---:|---:|---:|
| App/bootstrap | 8 / 10 | 6 / 10 | 7 / 10 | 6 / 10 |
| Prisma | 8 / 10 | 8 / 10 | 8 / 10 | 7 / 10 |
| Config | 7 / 10 | 5 / 10 | 7 / 10 | 6 / 10 |
| Common | 7 / 10 | 7 / 10 | 6 / 10 | 6 / 10 |
| Health | 7 / 10 | 7 / 10 | 6 / 10 | 6 / 10 |
| Auth | 8 / 10 | 7 / 10 | 7 / 10 | 6 / 10 |
| Users | 6 / 10 | 1 / 10 | 5 / 10 | 2 / 10 |
| Email | 6 / 10 | 2 / 10 | 3 / 10 | 2 / 10 |
| Lottery Draws | 6 / 10 | 1 / 10 | 5 / 10 | 3 / 10 |
| Purchases | 7 / 10 | 6 / 10 | 5 / 10 | 4 / 10 |
| Tickets | 6 / 10 | Not rated | 2 / 10 | 1 / 10 |

---

# Overall Backend Assessment

The backend has a sound technical foundation.

The strongest implemented decisions are:

- modular NestJS structure;
- strict DTO validation;
- Argon2 password hashing;
- separate access and refresh secrets;
- hashed refresh-token storage;
- atomic refresh rotation;
- one-time verification and recovery tokens;
- server-side purchase pricing;
- purchase state-event records;
- atomic ticket-range allocation.

The primary weakness is not poor code quality.

The primary weakness is that administrative and lifecycle-changing functionality exists before the required security and state-transition controls.

The backend should currently be classified as:

```text
working backend foundation
+
partially implemented MVP domain
+
not safe for public production exposure
```

## Final rating

| Area | Rating |
|---|---:|
| Architectural foundation | 7.5 / 10 |
| Code clarity | 7 / 10 |
| API security | 3 / 10 |
| Concurrency safety | 5 / 10 |
| Business-flow completeness | 3 / 10 |
| Testing | 1 / 10 |
| Production readiness | 2.5 / 10 |

---

# Frozen Decisions from This Audit

The following decisions are considered baseline unless replaced by an explicit ADR:

1. Amazing Chance remains a modular monolith for the MVP.
2. Module lifecycle changes occur through explicit application commands.
3. Administrative operations require permission-based authorization.
4. Ordinary users are created only through the Auth registration flow.
5. Users with business history are closed or anonymized, not physically deleted.
6. User status is enforced during access-token validation and refresh.
7. Sensitive tokens are never logged in production.
8. Purchase and draw state changes use explicit state machines.
9. Purchase retries use client-provided idempotency keys.
10. Payment confirmation, ledger allocation and ticket issuance share one controlled transaction boundary.
11. Ticket range allocation remains PostgreSQL-atomic.
12. Critical external side effects use transactional outbox.
13. Correlation IDs propagate through all critical operations.
14. New modules are not introduced before their invariants, transactions and tests are defined.
15. The API must not be publicly deployed before all P0 findings are resolved.

---

# Next Audit

The next audit is:

```text
04_SECURITY_AUDIT.md
```

It must cover:

- threat model;
- authentication;
- authorization;
- secrets;
- rate limiting;
- API attack surface;
- token security;
- logging and privacy;
- webhook security;
- dependency security;
- infrastructure exposure;
- production security controls.