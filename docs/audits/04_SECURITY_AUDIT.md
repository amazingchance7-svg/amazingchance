# Amazing Chance — Security Audit

**Audit baseline:** uploaded project archive `amazingchance.zip`

**Scope:** backend authentication, authorization, API exposure, token handling, password security, request validation, secrets, logging, CORS, Swagger, infrastructure exposure and security controls visible in the current source code.

**Status:** Security baseline. The API must not be exposed publicly before all P0 findings are resolved.

---

# Executive Summary

The Amazing Chance backend contains several strong security foundations:

- Argon2 password hashing;
- separate access and refresh JWT secrets;
- hashed refresh-token storage;
- atomic refresh-token rotation;
- one-time hashed email-verification and password-reset tokens;
- strict DTO validation;
- generic login failure responses;
- database transactions for sensitive token consumption;
- internal server errors hidden from API clients.

However, the current application is not safe for public production exposure.

The most serious risks are:

1. Administrative endpoints are publicly accessible.
2. No role or permission model exists.
3. Password hashes can be supplied directly through a public endpoint.
4. Suspended or closed users can continue using or refreshing existing sessions.
5. Password-reset and verification tokens are written to logs.
6. No rate limiting or brute-force protection exists.
7. Swagger is always publicly enabled.
8. Security headers are not configured.
9. Production secrets are insufficiently validated.
10. PostgreSQL and Redis are exposed on host ports in the current Docker configuration.

## Current security rating

| Area | Rating |
|---|---:|
| Password storage | 9 / 10 |
| Token storage | 8 / 10 |
| Refresh rotation | 8 / 10 |
| Input validation | 8 / 10 |
| Authentication lifecycle | 6 / 10 |
| Authorization | 1 / 10 |
| Abuse prevention | 1 / 10 |
| Secret management | 4 / 10 |
| Logging privacy | 3 / 10 |
| Infrastructure security | 3 / 10 |
| Production readiness | 2.5 / 10 |

---

# Threat Model

Amazing Chance must assume exposure to:

- unauthenticated internet traffic;
- credential stuffing;
- password spraying;
- brute-force login attempts;
- automated registration abuse;
- account enumeration;
- stolen access and refresh tokens;
- replayed requests;
- session hijacking;
- malicious users;
- compromised user email accounts;
- administrative-account compromise;
- API scraping;
- denial-of-service attempts;
- malformed or oversized requests;
- race conditions;
- payment-webhook forgery;
- malicious provider callbacks;
- log and monitoring-system exposure;
- database credential compromise;
- insider misuse;
- supply-chain vulnerabilities.

The platform processes money, identity data, tickets and draw evidence. Security controls therefore must protect both confidentiality and business correctness.

---

# Security Boundaries

Current trust boundaries include:

```text
Internet client
    ↓
NestJS HTTP API
    ↓
Authentication and authorization
    ↓
Application services
    ↓
Prisma
    ↓
PostgreSQL
```

External boundaries planned for later phases include:

```text
Payment providers
Email provider
RANDOM.ORG
Redis
Background workers
Object storage
Monitoring systems
Administrative interface
Telegram client
```

Every external input must be treated as untrusted, including signed provider webhooks until signature and replay validation succeeds.

---

# Positive Security Findings

## SEC-POS-001 — Passwords use Argon2

Passwords are hashed using:

```text
argon2.hash()
```

and verified using:

```text
argon2.verify()
```

Argon2 is appropriate for password storage.

The source code does not implement custom password cryptography.

---

## SEC-POS-002 — Access and refresh JWTs use separate secrets

Access and refresh tokens are signed with separate environment variables:

```text
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

This reduces the impact of one key being exposed and allows independent rotation policies.

---

## SEC-POS-003 — Refresh tokens are not stored in plaintext

Refresh tokens are hashed with SHA-256 before persistence.

The database stores:

```text
tokenHash
```

rather than the raw bearer token.

A direct database leak therefore does not immediately reveal active refresh tokens.

---

## SEC-POS-004 — Refresh rotation uses an atomic conditional update

The old refresh token is revoked through a conditional database operation requiring:

```text
revokedAt IS NULL
expiresAt > now
```

The operation verifies that exactly one row was updated.

This prevents two concurrent requests from successfully rotating the same token.

---

## SEC-POS-005 — Verification and reset tokens are random and hashed

Email-verification and password-reset tokens use cryptographically secure random bytes and are stored as hashes.

They are:

- time-limited;
- single-use;
- type-specific;
- consumed transactionally.

---

## SEC-POS-006 — Password reset revokes active refresh tokens

After password reset, existing refresh tokens are revoked.

This correctly forces reauthentication on other devices.

---

## SEC-POS-007 — Login responses reduce user enumeration

Login returns the same response for:

- unknown email;
- invalid password.

Forgot-password and resend-verification endpoints also return generic public messages.

This is a correct anti-enumeration practice.

---

## SEC-POS-008 — Global validation is strict

The API enables:

```text
whitelist = true
forbidNonWhitelisted = true
transform = true
```

This reduces risks from unexpected request properties and weak DTO handling.

---

## SEC-POS-009 — Unexpected internal errors are hidden

The global exception filter returns a generic internal-server-error response for unexpected exceptions.

Stack traces are logged server-side rather than returned to clients.

---

# P0 — Critical Authorization Findings

## SEC-001 — Administrative user endpoints are public

The current `UsersController` exposes administrative operations without authentication or authorization.

Publicly reachable operations include:

```text
GET /users
POST /users
PATCH /users/:id/status
DELETE /users/:id
```

Potential impact:

- user email enumeration;
- unauthorized account creation;
- unauthorized status changes;
- account activation without verification;
- user suspension;
- attempted deletion;
- privacy breach;
- administrative workflow bypass.

### Required remediation

1. Remove public access immediately.
2. Require JWT authentication.
3. Require explicit permissions.
4. Separate self-service and administrative controllers.
5. Add immutable audit records for every administrative action.
6. Require a reason for status changes.
7. Record actor, target user, previous state, new state and correlation ID.

**Priority:** P0  
**Production blocker:** Yes

---

## SEC-002 — Public endpoint accepts `passwordHash`

The public user-creation endpoint accepts a property named:

```text
passwordHash
```

The value is not cryptographically verified as a password hash.

A client can submit plaintext text and it may be stored directly in the password-hash column.

This bypasses the secure registration flow.

### Required remediation

- remove the external `POST /users` endpoint;
- never accept password hashes from HTTP clients;
- ordinary users must be created through `POST /auth/register`;
- administrative user creation must accept a temporary password or invitation flow, never a hash;
- all password creation and changes must pass through the password-hashing service.

**Priority:** P0  
**Production blocker:** Yes

---

## SEC-003 — Lottery draw mutations are public

The current API exposes draw-management operations without administrative authorization:

```text
POST /lottery-draws
PATCH /lottery-draws/:id
DELETE /lottery-draws/:id
```

Potential impact:

- unauthorized draw creation;
- ticket-price modification;
- currency modification;
- draw-date manipulation;
- sales opening or closure;
- cancellation;
- deletion;
- winner-count modification.

For a lottery platform, unauthorized modification of draw configuration is a direct integrity failure.

### Required remediation

Introduce permissions such as:

```text
draw.read
draw.create
draw.update
draw.open-sales
draw.close-sales
draw.cancel
draw.publish
```

High-risk commands should require stronger controls than ordinary administrative reads.

**Priority:** P0  
**Production blocker:** Yes

---

## SEC-004 — No role or permission model exists

The current user model cannot distinguish between:

- customer;
- support employee;
- compliance officer;
- draw operator;
- finance operator;
- auditor;
- administrator;
- super administrator.

Authentication alone cannot protect administrative functionality.

### Required remediation

Introduce permission-based authorization.

Recommended model:

```text
User
Role
Permission
UserRole
RolePermission
```

or a simpler MVP model that can evolve without storing unrestricted permissions directly in JWTs.

Permissions must be checked server-side against current account state.

### Required security principles

- least privilege;
- deny by default;
- separation of duties;
- no universal admin access for routine work;
- sensitive commands audited;
- permission changes audited;
- suspended administrators immediately lose access.

**Priority:** P0  
**Production blocker:** Yes

---

## SEC-005 — User status is not enforced by JWT validation

The JWT strategy verifies the token and loads the user, but does not reject users who are:

```text
SUSPENDED
CLOSED
not email-verified
```

An access token issued before suspension can remain usable until expiration.

### Required remediation

Create a dedicated authentication lookup:

```text
findActiveForAuthentication(userId)
```

It must require:

```text
status = ACTIVE
emailVerifiedAt IS NOT NULL
```

Administrative users may require additional checks:

- permission state;
- forced logout version;
- MFA state;
- security lock.

**Priority:** P0  
**Production blocker:** Yes

---

## SEC-006 — Refresh rotation does not enforce account state

Refresh-token rotation loads user status and verification state but does not validate them.

A suspended or closed user can continue obtaining new access and refresh tokens.

### Required remediation

During every refresh:

```text
user.status must equal ACTIVE
emailVerifiedAt must not be null
```

When a user is suspended or closed:

- revoke all refresh tokens;
- reject future refresh attempts;
- record the action in audit history.

**Priority:** P0  
**Production blocker:** Yes

---

# P0 — Sensitive Token Exposure

## SEC-007 — Verification and password-reset tokens are logged

The current development email service writes complete URLs containing raw tokens to application logs.

Examples include:

```text
Verification URL: ...?token=...
Password reset URL: ...?token=...
```

A password-reset token grants temporary authority to replace the account password.

Application logs may be available to:

- developers;
- system administrators;
- cloud logging providers;
- support teams;
- monitoring integrations;
- compromised log collectors.

### Required remediation

1. Raw tokens must never be logged in production.
2. Development logging must be impossible when `NODE_ENV=production`.
3. URLs must be redacted before logging.
4. Logging configuration must redact keys including:

```text
password
passwordHash
authorization
accessToken
refreshToken
token
secret
cookie
providerSignature
```

5. A real email adapter must be introduced before production.
6. Email delivery should use a transactional outbox.

**Priority:** P0  
**Production blocker:** Yes

---

# Immediate Security Decision

Until findings `SEC-001` through `SEC-007` are resolved:

```text
The API must remain local or restricted to a trusted development network.
```

It must not be published through:

- a public server;
- a public tunnel;
- a production domain;
- an internet-accessible cloud deployment;
- a publicly accessible staging environment containing real data.
---

# P1 — Abuse Prevention and Rate Limiting

## SEC-008 — No rate limiting exists

The API does not currently enforce request-rate limits.

High-risk endpoints include:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/forgot-password
POST /auth/resend-verification
POST /auth/reset-password
POST /purchases
```

Without rate limiting, the platform is exposed to:

- brute-force password attacks;
- credential stuffing;
- password spraying;
- automated account creation;
- email flooding;
- token endpoint abuse;
- API resource exhaustion;
- denial-of-service amplification.

### Required remediation

Introduce layered rate limiting.

Recommended dimensions:

```text
per IP
per user
per email identifier
per endpoint
global application limit
```

Suggested policy direction:

| Endpoint | Primary key | Additional key |
|---|---|---|
| login | IP | normalized email |
| register | IP | device or session |
| forgot password | IP | normalized email |
| resend verification | IP | normalized email |
| refresh | session/token family | IP |
| purchases | authenticated user | IP |

Rate-limit responses should not reveal whether an account exists.

Redis may be used for distributed counters, but PostgreSQL remains the source of business truth.

**Priority:** P1  
**Production blocker:** Yes for public deployment

---

## SEC-009 — No brute-force lockout or risk controls

The application rejects incorrect credentials but does not track suspicious authentication behavior.

Missing controls include:

- failed login counters;
- temporary account or identifier cooldown;
- suspicious IP detection;
- session anomaly detection;
- administrative alerting;
- optional CAPTCHA after risk threshold.

### Required remediation

Use progressive controls rather than permanent account lockout.

Preferred approach:

```text
normal attempts
→ short delay
→ stricter rate limit
→ temporary challenge
→ security alert
```

Avoid a design where an attacker can deliberately lock another user's account by submitting bad passwords.

**Priority:** P1

---

## SEC-010 — Registration abuse controls are absent

Public registration can be automated at scale.

Potential impact:

- database pollution;
- email-provider cost;
- disposable-email abuse;
- promotional abuse;
- account farming;
- future ticket or referral fraud.

### Required remediation

Before public launch, define:

- registration rate limits;
- email verification requirement;
- duplicate normalized-email prevention;
- optional disposable-email policy;
- CAPTCHA or proof-of-work only when risk justifies it;
- account-creation monitoring;
- fraud signals stored separately from business status.

**Priority:** P2

---

# P1 — JWT and Session Security

## SEC-011 — Access-token revocation is limited by token lifetime

Access JWTs are stateless.

After account suspension, password reset or permission change, an already-issued access token may remain valid until expiration unless every request reloads and validates current user state.

The current strategy loads the user, which is positive, but the required state checks are incomplete.

### Required remediation

Every protected request must verify current authentication eligibility.

For high-risk administrative or financial commands, additionally consider:

```text
authVersion
permissionsVersion
sessionVersion
```

Incrementing a version can invalidate older tokens without maintaining a denylist of every access token.

Access-token TTL should remain short.

**Priority:** P1

---

## SEC-012 — No explicit session model exists

Refresh tokens exist, but the platform does not yet expose a clear user-session model.

Missing capabilities include:

- list active sessions;
- revoke one device;
- revoke all other sessions;
- store device metadata;
- show last activity;
- detect suspicious reuse;
- identify token family.

### Required remediation

Introduce a session concept either directly or through refresh-token families.

A session should include:

```text
sessionId
userId
createdAt
lastUsedAt
expiresAt
revokedAt
ipHash or risk metadata
userAgent summary
token family identifier
```

Avoid storing excessive raw device data.

**Priority:** P2

---

## SEC-013 — Refresh-token reuse response is incomplete

A reused revoked token is rejected, but the system does not yet perform a broader security response.

A reused refresh token may indicate theft.

### Required remediation

When confirmed reuse occurs:

- revoke the complete token family;
- record a security event;
- optionally revoke all sessions for the user;
- notify the user if appropriate;
- require reauthentication;
- preserve evidence for investigation.

**Priority:** P2

---

## SEC-014 — JWT algorithm and claim policy must be explicit

The audit baseline confirms separate JWT secrets, but the complete production claim policy must be fixed.

Required claims and validation should include:

```text
sub
jti
iat
exp
type
issuer
audience
```

Validation must reject:

- wrong token type;
- wrong issuer;
- wrong audience;
- unexpected algorithm;
- expired token;
- malformed subject;
- missing token identifier where required.

### Required remediation

Define an explicit JWT profile in configuration and tests.

Never accept algorithm negotiation based only on incoming token headers.

**Priority:** P1

---

# P1 — Password and Account Recovery Security

## SEC-015 — Password policy is not fully documented or enforced as a security baseline

Current DTO validation may enforce a minimum length, but the production password policy is not fully established.

A secure policy should prioritize length over arbitrary complexity rules.

### Required remediation

Recommended baseline:

- minimum 12 characters for customer passwords;
- allow long passphrases;
- maximum length to prevent resource abuse;
- reject known compromised passwords where feasible;
- do not require frequent forced rotation;
- allow password managers;
- prevent reuse where required for privileged administrators.

For administrative accounts, stronger requirements and MFA are necessary.

**Priority:** P2

---

## SEC-016 — Password reset requires stronger operational controls

The one-time reset token design is strong, but the surrounding controls remain incomplete.

Required controls:

- rate limiting;
- token lifetime validation;
- single-use consumption;
- revocation of active sessions;
- generic public response;
- security-event logging;
- optional notification after successful password change;
- no raw token logging.

Most token mechanics are already present; operational controls must be completed.

**Priority:** P1

---

## SEC-017 — Administrative accounts require MFA

No multi-factor authentication model exists.

For a lottery platform, administrative accounts may control:

- draw schedules;
- sales status;
- financial operations;
- payouts;
- permissions;
- audit access.

Password-only authentication is insufficient for privileged users.

### Required remediation

Before an administrative interface is deployed:

- require MFA for privileged roles;
- prefer WebAuthn or TOTP;
- provide recovery procedures;
- audit MFA enrollment and removal;
- require step-up authentication for sensitive commands.

**Priority:** P1 before admin production access

---

# P1 — CORS, CSRF and Browser Security

## SEC-018 — CORS is configured for one origin but lacks a complete environment policy

Current configuration allows a configured web origin.

This is acceptable for development, but production needs a strict allowlist.

### Required remediation

Define allowed origins per environment:

```text
development
staging
production
admin
Telegram Web App, if used
```

Do not use wildcard origins with credentials.

Validate exact scheme, hostname and port.

**Priority:** P1

---

## SEC-019 — CSRF strategy depends on future token transport

Current JWT usage appears compatible with bearer tokens sent in the Authorization header.

If refresh or access tokens are later moved into cookies, CSRF protection becomes mandatory.

### Required decision

Choose and document one browser authentication model:

### Option A — Authorization header

- tokens accessible to application JavaScript;
- lower CSRF exposure;
- higher XSS impact.

### Option B — HttpOnly secure cookies

- lower token theft from JavaScript;
- CSRF protection required;
- SameSite policy required.

For production web clients, a common secure direction is:

```text
short-lived access token
HttpOnly Secure refresh cookie
SameSite policy
CSRF token for state-changing cookie-authenticated requests
```

The final design must account for Telegram and mobile clients separately.

**Priority:** P1 architectural decision

---

## SEC-020 — Security headers are not configured

The application does not visibly configure a complete HTTP security-header policy.

Missing or unconfirmed controls include:

- Content-Security-Policy;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame-ancestors or X-Frame-Options;
- Strict-Transport-Security in production;
- cross-origin policies where appropriate.

### Required remediation

Use a reviewed Helmet configuration.

Do not enable policies blindly; configure CSP according to the actual frontend, Swagger and external integrations.

**Priority:** P1

---

# P1 — Swagger and API Discovery

## SEC-021 — Swagger is always enabled

Swagger documentation is created regardless of environment.

Potential impact:

- complete endpoint discovery;
- DTO and schema exposure;
- easier attacker reconnaissance;
- accidental testing against production.

Swagger does not create the underlying authorization problem, but it increases visibility of the attack surface.

### Required remediation

In production:

- disable Swagger by default;
- or protect it behind strong authentication and network restrictions;
- never use Swagger protection as a substitute for endpoint authorization.

Configuration should use an explicit flag such as:

```text
SWAGGER_ENABLED=false
```

**Priority:** P1

---

## SEC-022 — API versioning is absent

Current routes are not globally versioned.

Security and authorization changes may require breaking API changes.

### Required remediation

Adopt a stable prefix:

```text
/api/v1
```

Versioning does not directly block exploitation, but it supports safe deprecation and controlled security upgrades.

**Priority:** P2

---

# P1 — Secrets and Environment Security

## SEC-023 — Secret entropy is not sufficiently validated

JWT secrets are required but may be weak strings.

### Required remediation

Production secrets must:

- be generated cryptographically;
- contain at least 32 random bytes;
- differ across environments;
- differ between access and refresh use;
- never be committed;
- support rotation;
- be delivered through a secret manager or protected deployment mechanism.

**Priority:** P0 before production

---

## SEC-024 — Local `.env` was included in the uploaded archive

The project archive contained a local environment file.

Even when `.env` is correctly ignored by Git, sharing archives can expose secrets.

### Required remediation

Create a safe archive script that excludes:

```text
.env
.env.*
node_modules
dist
.next
coverage
.git
```

Keep only:

```text
.env.example
```

Assume any real secret included in a shared archive may need rotation.

**Priority:** P1

---

## SEC-025 — No documented secret-rotation process exists

Production incidents require controlled rotation of:

- JWT access secret;
- JWT refresh secret;
- database password;
- Redis credentials;
- email-provider keys;
- payment-provider keys;
- RANDOM.ORG credentials;
- webhook secrets.

### Required remediation

Document:

- rotation owner;
- rotation frequency;
- emergency rotation;
- overlap period for old/new verification keys;
- session invalidation consequences;
- deployment sequence;
- incident evidence retention.

**Priority:** P2

---

# P1 — Logging, Privacy and Auditability

## SEC-026 — Logs lack consistent correlation identifiers

Current request logging records method, path, status and duration, but not a complete correlation chain.

### Required remediation

Every inbound request should receive:

```text
requestId
correlationId
```

Critical operations should also include:

```text
userId
actorType
businessEntityType
businessEntityId
operation
result
```

Do not log full secrets or unnecessary personal data.

**Priority:** P1

---

## SEC-027 — No centralized redaction policy exists

Even if current interceptors avoid request bodies, future payment, webhook or email code may accidentally log sensitive data.

### Required remediation

Define a mandatory logging-redaction policy.

Fields to redact include:

```text
authorization
cookie
password
passwordHash
accessToken
refreshToken
verificationToken
resetToken
paymentCardData
providerSecret
webhookSignature
privateKey
apiKey
```

Payload logging should be disabled by default for sensitive endpoints.

**Priority:** P1

---

## SEC-028 — Security events are not separated from ordinary application logs

Application logs are not a sufficient immutable security audit trail.

Security events should include:

- login success/failure;
- refresh reuse detection;
- password reset;
- user suspension;
- role or permission changes;
- administrative draw commands;
- payout operations;
- webhook verification failures;
- suspicious rate-limit events.

### Required remediation

Create a security-event model or clearly governed audit-log category.

Security events should be:

- append-only;
- queryable;
- access-controlled;
- retained according to policy;
- protected from ordinary application modification.

**Priority:** P1

---

# P1 — Error Handling and Information Disclosure

## SEC-029 — Error responses are generally safe, but error codes need governance

The global exception filter hides internal errors, which is positive.

However, business and security errors need stable machine-readable codes.

### Required remediation

Use codes such as:

```text
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_UNAVAILABLE
AUTH_TOKEN_EXPIRED
AUTH_REFRESH_REUSED
AUTH_PERMISSION_DENIED
PURCHASE_INVALID_STATE
DRAW_INVALID_STATE
RATE_LIMITED
```

Avoid exposing internal database error names or provider details.

**Priority:** P2

---

## SEC-030 — Prisma constraint errors may surface as generic 500 responses

Some known conditions, such as restricted deletion or uniqueness races, may not be mapped to controlled API errors.

Potential impact is mostly operational and information consistency rather than direct compromise.

### Required remediation

Map known Prisma errors to safe domain errors:

```text
P2002 → conflict
P2003 → operation not allowed
P2025 → not found or stale transition
```

Never return raw Prisma messages.

**Priority:** P2
---

# P1 — Injection and Input Handling

## SEC-031 — SQL injection risk is currently low but raw SQL requires strict discipline

Most database access uses Prisma, which significantly reduces ordinary SQL-injection risk.

However, the project already uses raw SQL for ticket-sequence allocation.

Current raw queries are parameterized, which is correct.

### Required rule

Raw SQL is permitted only when:

- Prisma cannot express the required operation safely;
- all dynamic values use parameter binding;
- table and column names are never built from untrusted input;
- the query is reviewed;
- integration tests cover malicious input;
- transaction behavior is documented.

Never use string concatenation such as:

```text
"SELECT ... " + userInput
```

**Priority:** P1 governance rule

---

## SEC-032 — UUID parameters need consistent validation

Routes use entity identifiers such as:

```text
/users/:id
/purchases/:id
/lottery-draws/:id
```

All UUID route parameters should be validated before reaching Prisma.

### Required remediation

Use:

```text
ParseUUIDPipe
```

or validated DTO parameters consistently.

This prevents malformed identifiers from reaching lower layers and improves stable error handling.

**Priority:** P2

---

## SEC-033 — Request-size limits are not explicitly defined

JSON body size, URL length and payload-size limits are not visibly governed.

Potential risks include:

- memory pressure;
- oversized JSON;
- log amplification;
- denial-of-service attempts;
- future webhook payload abuse.

### Required remediation

Define endpoint-appropriate limits for:

- ordinary JSON requests;
- provider webhooks;
- file uploads, if introduced;
- multipart forms;
- exported evidence.

Reject oversized requests before expensive processing.

**Priority:** P2

---

# P1 — XSS and Output Security

## SEC-034 — Backend output encoding depends on clients

The API mainly returns JSON and does not directly render HTML.

This lowers direct server-side XSS risk, but stored data may later be displayed in:

- web application;
- admin interface;
- Telegram client;
- public verification pages;
- emails.

Untrusted fields may include:

- display names;
- administrative reasons;
- provider messages;
- metadata;
- audit descriptions.

### Required remediation

- treat all stored text as untrusted;
- encode output in the rendering client;
- never render arbitrary HTML from API data;
- sanitize only when rich text is explicitly required;
- configure Content Security Policy on browser applications.

**Priority:** P2

---

## SEC-035 — Provider data must not be rendered directly

Payment, email and randomness providers may return human-readable messages or JSON metadata.

These values must not be passed directly into HTML or administrative pages.

### Required remediation

Map provider responses into internal safe fields.

Preserve raw provider evidence only in protected storage and display it as escaped text when necessary.

**Priority:** P2

---

# P0/P1 — Webhook and Payment Security

## SEC-036 — Payment webhook security is not implemented

Payment webhook handling is planned but not yet implemented.

A secure webhook flow must not trust a request merely because it reaches the correct endpoint.

### Mandatory controls

Every provider webhook must verify:

- provider identity;
- cryptographic signature;
- signature algorithm;
- signed raw body;
- timestamp or freshness;
- provider event ID;
- replay protection;
- expected account or merchant ID;
- expected currency;
- expected amount;
- expected purchase reference.

The request must be rejected before any financial state changes if validation fails.

**Priority:** P0 before payment integration

---

## SEC-037 — Raw webhook body preservation must be designed before implementation

Many providers sign the exact raw request body.

Parsing JSON and then reconstructing it may invalidate signature verification.

### Required remediation

Configure the framework so the exact raw body is available to the webhook verifier.

This requirement must be established before writing webhook controllers.

**Priority:** P0 before payment integration

---

## SEC-038 — Webhook replay protection requires durable idempotency

The schema includes provider event identifiers, which is a strong foundation.

The final handler must guarantee:

```text
same provider event
→ same stored result
→ no duplicate financial action
```

### Required transaction order

```text
verify signature
verify freshness
identify provider event
begin transaction
insert or lock webhook event
detect prior processing
validate business references
apply state transition
create ledger records
create ticket allocation if applicable
mark webhook processed
commit
```

Retries must return success when the event was already safely processed.

**Priority:** P0 before payment integration

---

## SEC-039 — Client redirects cannot confirm payment

Browser success pages, query parameters or frontend callbacks must never change payment status.

Only independently verified provider communication may confirm payment.

### Required rule

```text
frontend redirect = user experience only
signed webhook or verified provider API = payment truth
```

**Priority:** P0 before payment integration

---

## SEC-040 — Payment amount and currency must be verified server-side

The provider result must match the server-created purchase.

The application must verify:

```text
purchase ID
provider merchant account
amount
currency
payment status
provider transaction ID
```

No amount received from the browser may be trusted.

**Priority:** P0 before payment integration

---

## SEC-041 — Payment confirmation must be transactionally connected to business effects

A successful payment eventually causes:

- payment confirmation;
- purchase transition;
- financial allocation;
- ledger postings;
- ticket-range reservation;
- ticket creation;
- state events;
- outbox events.

Partial completion is unacceptable.

### Required remediation

Define one controlled transaction boundary with retry-safe orchestration.

External provider calls must not occur while the database transaction remains open.

**Priority:** P0 before payment integration

---

# P0/P1 — Randomness and Draw Security

## SEC-042 — Randomness-provider integration is not implemented

The platform design requires independently verifiable randomness.

The future integration must verify and preserve:

- request parameters;
- provider request ID;
- provider response;
- signature or authenticity evidence;
- timestamp;
- requested range;
- requested count;
- normalized result;
- verification status;
- canonical hash.

**Priority:** P0 before a real draw

---

## SEC-043 — Randomness evidence must be immutable

After accepted provider evidence is linked to a draw, ordinary application credentials must not be able to modify it.

### Required remediation

Use:

- append-only database rules;
- immutable evidence artifact;
- canonical hashing;
- protected object storage;
- public verification record;
- restricted administrative access.

**Priority:** P0 before a real draw

---

## SEC-044 — Draw execution requires separation of duties

One administrator should not be able to:

```text
change draw configuration
close sales
request randomness
select winners
publish results
change prizes
```

without independent controls.

### Required remediation

Define distinct permissions and, for the most sensitive operations, approval policies.

Possible roles:

```text
draw operator
draw approver
auditor
finance operator
```

At minimum, every action must be attributable and immutable in the audit trail.

**Priority:** P1 before admin launch

---

## SEC-045 — Snapshot closure must prevent late ticket inclusion

Once ticket sales close and a snapshot is finalized:

- no new eligible ticket may be added;
- snapshot membership cannot change;
- snapshot hash cannot change;
- winner selection must reference the finalized snapshot.

This requires database and application controls, not only UI restrictions.

**Priority:** P0 before a real draw

---

## SEC-046 — Winner selection must be deterministic and reproducible

Given:

```text
finalized snapshot
verified random positions
published algorithm version
```

any independent verifier must derive the same winners.

### Required remediation

- version the winner-selection algorithm;
- reject duplicate or out-of-range positions;
- store deterministic mappings;
- publish verification inputs;
- prohibit manual winner replacement.

**Priority:** P0 before a real draw

---

# P0/P1 — Administrative Security

## SEC-047 — Administrative interface must be isolated from customer functionality

Future administrative endpoints should not simply coexist as unstructured public CRUD operations.

### Required remediation

Use a clearly defined administrative API surface, for example:

```text
/api/v1/admin/...
```

Apply:

- privileged authentication;
- MFA;
- permission checks;
- stronger rate limits;
- audit logging;
- network restrictions where possible;
- step-up authentication for high-risk operations.

**Priority:** P1 before admin launch

---

## SEC-048 — High-risk commands require reauthentication or step-up controls

Operations such as these should require recent strong authentication:

- permission changes;
- draw cancellation;
- draw publication;
- payout approval;
- secret rotation;
- MFA removal;
- account recovery for administrators.

**Priority:** P1 before admin launch

---

## SEC-049 — No emergency access procedure exists

A production platform needs a controlled method for emergency response without creating permanent unrestricted accounts.

### Required remediation

Define a break-glass procedure with:

- limited duration;
- named approver;
- MFA;
- mandatory reason;
- immediate alerting;
- full audit trail;
- post-incident review;
- automatic expiration.

**Priority:** P2

---

# P1 — Dependency and Supply-Chain Security

## SEC-050 — Automated dependency vulnerability scanning is not configured

The project depends on:

- NestJS;
- Next.js;
- Prisma;
- PostgreSQL adapter;
- JWT and Passport libraries;
- Argon2;
- numerous transitive packages.

### Required remediation

CI should include:

- lockfile-respecting install;
- dependency vulnerability scan;
- automated update monitoring;
- review of high and critical findings;
- secret scanning;
- license review where required.

Examples of suitable mechanisms include repository-native dependency alerts and package-manager audit tooling.

**Priority:** P1

---

## SEC-051 — Build provenance and deployment artifact integrity are not defined

Production should deploy artifacts created by CI, not a developer's local directory.

### Required remediation

- deterministic lockfile install;
- CI-produced container images;
- immutable image tags or digests;
- restricted registry access;
- vulnerability scanning;
- deployment by digest;
- environment-specific configuration injected at runtime.

**Priority:** P2

---

## SEC-052 — Install scripts and transitive packages require governance

Node package installation can execute lifecycle scripts.

### Required remediation

- review unusual new dependencies;
- minimize package count;
- avoid abandoned packages;
- pin through the lockfile;
- restrict dependency introduction;
- run builds in isolated CI;
- monitor unexpected lockfile changes.

**Priority:** P2

---

# P1 — Docker and Network Security

## SEC-053 — PostgreSQL and Redis are exposed on host ports

The local Docker Compose publishes database services to the host.

This is convenient for development but unsafe as a production pattern.

### Required remediation

Production infrastructure should:

- use private networks;
- avoid public database ports;
- restrict security groups/firewall rules;
- require database authentication;
- use TLS where supported and required;
- separate application and data tiers;
- monitor connection attempts.

**Priority:** P0 if current Compose is reused publicly

---

## SEC-054 — Redis security policy is not defined

Redis is present in local infrastructure, but production controls are not established.

Redis may later hold:

- rate-limit counters;
- short-lived caches;
- job coordination;
- distributed locks.

### Required remediation

- private network only;
- authentication and TLS where applicable;
- no financial source-of-truth data;
- explicit key prefixes and TTLs;
- memory limits;
- eviction policy review;
- access restricted to required services.

**Priority:** P1 before Redis production use

---

## SEC-055 — Containers are not yet hardened

Future API and web containers should not run with unnecessary privileges.

### Required remediation

Production images should use:

- non-root user;
- minimal base image;
- read-only filesystem where possible;
- dropped Linux capabilities;
- no development tools;
- health checks;
- resource limits;
- separate build and runtime stages;
- controlled writable directories.

**Priority:** P2

---

## SEC-056 — Backup and restore security are not defined

Database backups contain sensitive user, financial and lottery data.

### Required remediation

Backups must be:

- encrypted;
- access-controlled;
- monitored;
- retained by policy;
- periodically restored in tests;
- protected from application-level deletion;
- included in incident-response planning.

**Priority:** P1 before production data

---

# P1 — Data Privacy and Sensitive Information

## SEC-057 — Personal-data classification is not documented

Current and future data includes:

- email;
- IP and device data;
- purchases;
- tickets;
- prize and payout data;
- security events;
- potentially identity-verification information.

### Required remediation

Create a data-classification policy:

```text
public
internal
confidential
restricted
```

Define retention, access, encryption and logging rules for each category.

**Priority:** P2

---

## SEC-058 — Database encryption and transport requirements are not documented

Local development uses ordinary local connectivity.

Production requirements must define:

- TLS in transit;
- encrypted disks and backups;
- key management;
- restricted database roles;
- credential rotation;
- audit access.

**Priority:** P1 before production

---

## SEC-059 — Data minimization is required for logs and session metadata

Do not retain full IP addresses, full user agents or complete provider payloads indefinitely unless justified.

Use:

- retention windows;
- hashing or truncation where appropriate;
- restricted raw-evidence storage;
- purpose-specific metadata.

**Priority:** P2

---

# P1 — Denial-of-Service and Availability Security

## SEC-060 — No application-level resource protection exists

Beyond future rate limiting, the API needs protection against expensive operations.

### Required remediation

Define:

- pagination maximums;
- ticket purchase maximums;
- query timeouts;
- database connection limits;
- transaction timeouts;
- worker concurrency;
- provider-call timeouts;
- circuit breakers where appropriate;
- request body limits.

**Priority:** P1

---

## SEC-061 — External calls require strict timeout and retry policies

Email, payment and randomness integrations must never wait indefinitely.

### Required remediation

Every external adapter must define:

- connection timeout;
- response timeout;
- bounded retries;
- exponential backoff;
- retryable error classification;
- idempotency behavior;
- circuit-breaking policy;
- correlation ID.

**Priority:** P1 before integration

---

## SEC-062 — Retry storms must be prevented

Workers and providers may retry simultaneously during outages.

### Required remediation

Use:

- exponential backoff;
- jitter;
- maximum attempts;
- dead-letter handling;
- idempotent consumers;
- operational alerting.

**Priority:** P2

---

# Security Testing Requirements

No security-sensitive flow should be considered complete without automated tests.

## Authentication tests

Required:

- registration hashes passwords;
- duplicate registration behavior;
- inactive account login rejected;
- unverified account login rejected;
- invalid password response;
- expired access token;
- invalid token type;
- wrong issuer and audience;
- refresh rotation;
- concurrent refresh attempts;
- suspended-user refresh rejected;
- password reset revokes sessions;
- token single-use behavior.

## Authorization tests

Required:

- anonymous user denied;
- customer denied admin operations;
- permission-specific access;
- suspended administrator denied;
- role change takes effect;
- object-level authorization;
- audit record created for privileged command.

## Abuse tests

Required:

- login rate limiting;
- forgot-password enumeration resistance;
- registration throttling;
- oversized payload rejection;
- pagination limits;
- repeated idempotency request.

## Webhook tests

Required before payment integration:

- valid signature;
- invalid signature;
- modified body;
- expired timestamp;
- duplicate event;
- concurrent duplicate events;
- amount mismatch;
- currency mismatch;
- unknown purchase;
- already-confirmed purchase;
- forged browser callback.

## Draw-security tests

Required before a real draw:

- finalized snapshot immutable;
- duplicate snapshot ticket rejected;
- late ticket excluded;
- invalid randomness signature rejected;
- duplicate random position rejected;
- deterministic winner reproduction;
- unauthorized draw command denied;
- audit evidence complete.

---

# Security Remediation Roadmap

## P0 — Public-deployment blockers

1. Protect all user administrative endpoints.
2. Remove external `passwordHash` acceptance.
3. Protect all draw mutation endpoints.
4. Add roles and permissions.
5. Enforce active verified user state in JWT validation.
6. Enforce active verified user state during refresh.
7. Revoke sessions on suspension and closure.
8. Stop logging raw tokens.
9. Enforce strong production secrets.
10. Add rate limiting to authentication endpoints.
11. Prevent public database and Redis exposure.
12. Add automated tests for existing authentication and authorization flows.

---

## P0 — Before payment integration

1. Define signed raw-body webhook verification.
2. Add replay-safe durable webhook idempotency.
3. Verify amount, currency, merchant and purchase reference.
4. Prevent browser redirects from confirming payment.
5. Define atomic payment-to-ledger-to-ticket transaction.
6. Add concurrency and duplicate-webhook tests.

---

## P0 — Before a real draw

1. Finalize immutable ticket snapshot controls.
2. Implement authenticated and immutable randomness evidence.
3. Make winner selection deterministic and versioned.
4. Prevent manual winner modification.
5. Complete draw-command authorization.
6. Publish independently verifiable evidence.

---

## P1 — Security foundation

1. Add Helmet and reviewed security headers.
2. Define CORS allowlists.
3. Decide browser token and CSRF model.
4. Protect or disable Swagger in production.
5. Add correlation IDs and structured logs.
6. Add centralized redaction.
7. Add security-event auditing.
8. Add MFA for administrators.
9. Add transactional outbox.
10. Add external-call timeout and retry policies.
11. Add dependency and secret scanning in CI.
12. Define backup, encryption and DB-role policies.

---

## P2 — Advanced hardening

1. Session management UI and device revocation.
2. Refresh-token family reuse response.
3. Step-up authentication.
4. Break-glass access.
5. Risk-based authentication signals.
6. Data classification and retention policy.
7. Container hardening.
8. Build provenance and image signing where justified.
9. Advanced monitoring and anomaly alerts.
10. Periodic penetration testing before major launches.

---

# Final Security Assessment

## Strengths

The current project already avoids several common security mistakes:

- passwords are not stored with weak hashing;
- refresh tokens are not stored in plaintext;
- refresh rotation is concurrency-aware;
- one-time user tokens are hashed and transactional;
- validation rejects unknown fields;
- authentication errors reduce account enumeration;
- internal exceptions are not exposed directly.

## Weaknesses

The current security posture is dominated by authorization and operational gaps:

- public administrative endpoints;
- no permission model;
- session state not fully enforced;
- token leakage through logs;
- no abuse prevention;
- no production secret policy;
- no webhook security;
- no administrative MFA;
- no public-deployment network hardening;
- insufficient automated tests.

## Classification

The current backend should be classified as:

```text
secure authentication foundation
+
unsafe administrative exposure
+
incomplete production security controls
```

## Final rating

| Security domain | Rating |
|---|---:|
| Password protection | 9 / 10 |
| Refresh-token design | 8 / 10 |
| Recovery-token design | 8 / 10 |
| Input validation | 8 / 10 |
| Account-state enforcement | 4 / 10 |
| Authorization | 1 / 10 |
| Rate limiting and abuse protection | 1 / 10 |
| Logging privacy | 3 / 10 |
| Secrets management | 4 / 10 |
| Webhook/payment security | Not implemented |
| Draw-security controls | Not implemented |
| Infrastructure security | 3 / 10 |
| Security testing | 1 / 10 |
| Production security readiness | 2.5 / 10 |

---

# Frozen Security Decisions

These decisions are baseline unless replaced by an explicit ADR:

1. All access is denied by default unless explicitly permitted.
2. Administrative access uses permission-based authorization.
3. Privileged users require MFA before production access.
4. Suspended, closed or unverified users cannot authenticate or refresh.
5. Raw passwords, tokens, secrets and signatures are never logged.
6. External clients never submit password hashes.
7. Access tokens are short-lived and current account state is checked.
8. Refresh-token reuse triggers a security response.
9. Authentication endpoints are rate-limited.
10. Browser token transport and CSRF policy must be explicitly documented.
11. Payment status changes only after independently verified provider evidence.
12. Webhook handlers verify signatures, freshness and replay protection.
13. Browser redirects never confirm payments.
14. Draw configuration and execution require explicit privileged commands.
15. Snapshots, randomness evidence, winners and audit history are immutable.
16. Administrative and financial actions include actor and correlation ID.
17. PostgreSQL and Redis are never publicly exposed in production.
18. Production secrets come from protected secret management and support rotation.
19. Critical security behavior is covered by automated tests.
20. The API cannot be publicly launched until all P0 security findings are resolved.

---

# Next Audit

The next document is:

```text
05_BUSINESS_FLOW_AUDIT.md
```

It must evaluate the complete intended lifecycle:

```text
registration
email verification
login
purchase
payment
ticket issuance
draw closure
snapshot
randomness
winner selection
prize
payout
refund
annual draw
public verification
```

The final remediation plan must be created only after that audit is complete.