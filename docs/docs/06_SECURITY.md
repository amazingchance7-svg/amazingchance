# 06 — Security Architecture

## Security objectives

- Prevent unauthorized access.
- Limit impact of stolen credentials.
- Prevent tampering with payment and ticket state.
- Detect replay, automation, and abuse.
- Protect secrets and personal data.
- Preserve evidence for investigation.

## Authentication

Recommended baseline:

- Argon2id password hashing with reviewed parameters.
- Short-lived access tokens.
- Rotating refresh-token families.
- Refresh-token reuse detection and family revocation.
- Session inventory and remote revocation.
- Email or equivalent ownership verification.
- MFA required for privileged users.

Tokens are never logged. Store refresh-token hashes, not raw tokens.

## Authorization

Use explicit permissions, not only broad roles.

Examples:

- `draw.read`
- `draw.manage`
- `payment.review`
- `refund.create`
- `refund.approve`
- `audit.read`
- `role.manage`

Every resource operation verifies ownership, tenant/jurisdiction context where applicable, and permission.

## Administrative controls

- Separate admin application origin.
- Mandatory MFA.
- Shorter sessions.
- Step-up authentication for high-risk actions.
- Reason field for critical changes.
- Two-person approval for selected actions.
- Full audit trail.

## Input and API protection

- Global validation with whitelist and forbidden unknown properties where appropriate.
- Strict UUID/public-ID formats.
- Body-size and file-size limits.
- Content-type enforcement.
- CORS allowlist.
- Security headers.
- Rate limits by IP, account, endpoint, and risk signal.
- Login throttling and credential-stuffing detection.

## Injection protection

Use Prisma parameterization and tagged SQL templates. Never construct raw SQL from concatenated untrusted values.

Dynamic identifiers such as sort columns use allowlists.

## CSRF and browser security

If authentication uses cookies:

- `HttpOnly`, `Secure`, and appropriate `SameSite` settings;
- CSRF tokens for state-changing requests where required;
- origin checks;
- no secrets in browser storage when avoidable.

## Secrets

- No secrets in repository, images, logs, or client bundles.
- Separate secrets per environment.
- Rotation and emergency revocation procedures.
- Least-privilege service credentials.
- Production database account cannot perform schema administration.

## Personal data

- Collect the minimum required fields.
- Encrypt transport everywhere.
- Use disk/database encryption provided by the platform.
- Redact logs.
- Define retention and deletion/anonymization workflows.
- Restrict support and admin views by permission.

## Abuse and fraud

Controls may include:

- account velocity limits;
- purchase limits;
- device and IP risk signals;
- payment-failure velocity;
- duplicate-account indicators;
- jurisdiction and sanctions controls;
- manual review queues.

Automated risk decisions must be auditable.

## Dependency and supply-chain security

- Lockfiles committed.
- Automated dependency scanning.
- Secret scanning.
- SAST and container scanning.
- Protected branches and reviewed pull requests.
- Signed or attestable production builds where practical.
