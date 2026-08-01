# Amazing Chance — Dependency and Build Audit

**Audit baseline:** uploaded archive `amazingchance.zip`  
**Scope:** root workspace configuration, package manifests, lockfile, TypeScript, linting, build scripts, Prisma commands, Docker Compose, and test readiness.  
**Status:** Supporting audit for `REP-001` and `REP-002`.

---

# Executive Summary

The repository has a workable pnpm monorepo foundation, but the current build and quality pipeline is incomplete.

The most important findings are:

1. `pnpm test` does not exist.
2. The frontend lint command is invalid for Next.js 16.
3. No ESLint configuration was found in the audited archive.
4. Backend and frontend use different TypeScript major versions.
5. Node.js version is not pinned even though Next.js 16 requires Node.js 20.9 or newer.
6. Production migration and test-database scripts are missing.
7. Build/typecheck/lint commands are not yet protected by CI.
8. The local Docker Compose configuration is suitable for development only.

Current build-system readiness: **4 / 10**

---

# 1. Workspace Configuration

Root package manager:

```json
"packageManager": "pnpm@10.15.0"
```

Workspace paths:

```yaml
packages:
  - apps/*
  - packages/*
```

This is a valid monorepo structure.

The unused `packages/*` path is acceptable as a future extension point and does not require removal.

## Finding BUILD-001 — Node.js version is not pinned

The repository does not contain a visible `.nvmrc`, `.node-version`, Volta configuration, or `engines.node` declaration.

Next.js 16 requires Node.js 20.9 or newer.

### Required remediation

Add one explicit Node.js baseline across local development and CI.

Recommended baseline:

```text
Node.js 22 LTS
pnpm 10.15.0
```

Add:

```json
"engines": {
  "node": ">=22 <23",
  "pnpm": "10.15.0"
}
```

Also add `.nvmrc` or `.node-version`.

**Priority:** P0 for reproducible CI

---

# 2. Root Scripts

Current root scripts:

```json
{
  "dev": "pnpm --parallel --filter @amazing-chance/web --filter @amazing-chance/api dev",
  "build": "pnpm -r build",
  "lint": "pnpm -r lint",
  "typecheck": "pnpm -r typecheck",
  "db:generate": "pnpm --filter @amazing-chance/api prisma:generate",
  "db:migrate": "pnpm --filter @amazing-chance/api prisma:migrate",
  "db:studio": "pnpm --filter @amazing-chance/api prisma:studio"
}
```

## Positive findings

- Commands are centralized at the workspace root.
- Recursive build, lint, and typecheck are defined.
- Prisma commands are routed to the API workspace.
- Development starts both applications in parallel.

## Finding BUILD-002 — No test scripts exist

Missing:

```text
test
test:unit
test:integration
test:coverage
test:e2e
```

This directly blocks `REP-001`.

**Priority:** P0

---

## Finding BUILD-003 — No production migration command exists

The only migration script runs:

```text
prisma migrate dev
```

This command is for development and must not be used in production deployment.

### Required remediation

Add:

```json
"prisma:migrate:dev": "prisma migrate dev",
"prisma:migrate:deploy": "prisma migrate deploy",
"prisma:migrate:status": "prisma migrate status"
```

At root:

```json
"db:migrate:dev": "...",
"db:migrate:deploy": "...",
"db:migrate:status": "..."
```

**Priority:** P1

---

# 3. Backend Package

Current backend stack:

```text
NestJS 11
Prisma 7.9
TypeScript 5.9.3
ESLint 9.34
Argon2
Passport/JWT
PostgreSQL adapter
```

The versions are internally plausible and suitable for the project.

## Finding BUILD-004 — Backend lint command has no visible ESLint configuration

Current command:

```json
"lint": "eslint "src/**/*.ts""
```

No root or API `eslint.config.*` file was found in the audited archive.

With ESLint 9, an explicit flat configuration is expected.

### Consequence

`pnpm lint` may fail because ESLint cannot find a configuration.

### Required remediation

Create a root or API `eslint.config.mjs` with:

- TypeScript parser support;
- NestJS-compatible rules;
- import/order rules only if they add value;
- ignores for `dist`, generated Prisma files, coverage, and migrations where appropriate.

**Priority:** P0 before CI

---

## Finding BUILD-005 — No separate build TypeScript configuration

The API uses one `tsconfig.json` for both typecheck and build.

This is workable at the current size, but tests and scripts will later need different inclusion rules.

### Recommended direction

Add:

```text
tsconfig.json
tsconfig.build.json
tsconfig.spec.json
```

`tsconfig.build.json` should exclude:

```text
**/*.spec.ts
**/*.test.ts
test/
coverage/
```

**Priority:** P1 during `REP-001`

---

## Finding BUILD-006 — TypeScript config contains a BOM and unusual formatting

The API `tsconfig.json` begins with a UTF-8 BOM and appears PowerShell-formatted.

This is not necessarily a runtime error, but it creates noisy diffs and inconsistent formatting.

### Required remediation

Rewrite as standard UTF-8 without BOM and format consistently.

**Priority:** P3

---

# 4. Frontend Package

Current frontend stack:

```text
Next.js 16.2.11
React 19.2
TypeScript 7.0.2
```

## Finding BUILD-007 — `next lint` is removed in Next.js 16

Current script:

```json
"lint": "next lint"
```

Next.js 16 removed the `next lint` command. Linting must run through ESLint or Biome directly.

### Required remediation

Recommended ESLint direction:

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

Add:

```text
eslint
eslint-config-next
eslint.config.mjs
```

**Priority:** P0 before CI

---

## Finding BUILD-008 — Frontend has no linter dependencies

The frontend manifest does not contain ESLint, Biome, or `eslint-config-next`.

Therefore, replacing the script alone is insufficient.

**Priority:** P0 before CI

---

## Finding BUILD-009 — Backend and frontend use different TypeScript major versions

Backend:

```text
TypeScript 5.9.3
```

Frontend:

```text
TypeScript 7.0.2
```

Different versions can produce inconsistent diagnostics and editor behavior.

TypeScript 7 also represents a major compiler transition and should not be introduced casually into only one workspace.

### Required decision

Choose one tested workspace version.

Recommended conservative option for the first remediation batch:

```text
TypeScript 6.x or one explicitly verified version across both apps
```

Do not change the version until both builds have been tested on the selected Node.js baseline.

**Priority:** P1

---

## Finding BUILD-010 — React type versions do not exactly match React runtime versions

Runtime:

```text
react 19.2.0
react-dom 19.2.0
```

Types:

```text
@types/react 19.1.12
@types/react-dom 19.1.9
```

This may work, but matching compatible current type packages is safer, particularly with a new TypeScript major.

### Required remediation

Update and validate the React type packages together with the TypeScript decision.

**Priority:** P2

---

# 5. Lockfile and Dependency Discipline

## Positive findings

- A single pnpm lockfile exists.
- Application dependency versions are mostly pinned exactly.
- Prisma CLI and client use the same version.
- NestJS core packages use matching versions.

## Finding BUILD-011 — No automated dependency policy

No visible CI policy currently checks:

- lockfile integrity;
- dependency vulnerabilities;
- unexpected lockfile changes;
- outdated critical packages;
- secret leakage.

### Required remediation

Add to CI:

```text
pnpm install --frozen-lockfile
pnpm audit or approved equivalent
secret scanning
dependency update monitoring
```

**Priority:** P1

---

## Finding BUILD-012 — Native dependency build policy requires validation

The workspace contains:

```yaml
ignoredBuiltDependencies:
  - prisma
```

The project also uses native or generated dependencies, including Prisma and Argon2.

The installation process must be tested from a clean environment to confirm that required engines and native binaries are correctly produced.

### Required remediation

CI must install from an empty cache at least in one job and then run:

```text
prisma generate
backend build
auth password-hash test
```

**Priority:** P1

---

# 6. Docker Compose

## Positive findings

- PostgreSQL and Redis are versioned images.
- Persistent volumes exist.
- Health checks exist.
- Default environment values support local setup.

## Finding BUILD-013 — Default password is unsafe outside local development

Default:

```text
change_me
```

This is acceptable only for isolated local development.

### Required remediation

- clearly label the Compose file as local development;
- refuse default credentials in production configuration;
- never reuse this Compose file unchanged for public deployment.

**Priority:** P1

---

## Finding BUILD-014 — API and web are not containerized

The current Compose file only starts data services.

This is acceptable for development, but it cannot validate production-like application startup.

### Recommended future direction

Add separate deployment configuration later, not necessarily to the local Compose file:

```text
api image
web image
migration job
worker image
private PostgreSQL
private Redis
reverse proxy or platform ingress
```

**Priority:** P2

---

# 7. Test Framework Decision for REP-001

## Recommended backend setup

Use Jest for the first implementation because it fits NestJS conventions and has mature tooling.

Add dev dependencies to `apps/api`:

```text
jest
ts-jest
@types/jest
supertest
@types/supertest
```

Potential later addition:

```text
testcontainers
```

Use Testcontainers only if Docker-based integration tests remain reliable on developer machines and CI. A dedicated test PostgreSQL service is also acceptable.

## Required test layers

```text
unit
integration
concurrency
e2e API
```

Initial mandatory tests:

1. Argon2 password hashing and verification.
2. Email-verification token single use.
3. Password-reset token single use.
4. Refresh-token rotation.
5. Concurrent refresh-token rotation.
6. Ticket-allocation range uniqueness under concurrency.
7. Purchase ownership authorization.
8. Existing DTO validation behavior.

---

# 8. Required Script Target

The target root scripts after `REP-001` should include:

```json
{
  "test": "pnpm -r test",
  "test:unit": "pnpm --filter @amazing-chance/api test:unit",
  "test:integration": "pnpm --filter @amazing-chance/api test:integration",
  "test:coverage": "pnpm --filter @amazing-chance/api test:coverage",
  "lint": "pnpm -r lint",
  "typecheck": "pnpm -r typecheck",
  "build": "pnpm -r build"
}
```

Backend target scripts:

```json
{
  "test": "jest",
  "test:unit": "jest --selectProjects unit",
  "test:integration": "jest --selectProjects integration --runInBand",
  "test:coverage": "jest --coverage",
  "test:watch": "jest --watch"
}
```

Exact configuration may differ after implementation, but the separation between fast unit tests and database integration tests is mandatory.

---

# 9. Remediation Plan Additions

Add or clarify these items in `REMEDIATION_PLAN.md`:

| ID | Priority | Addition |
|---|---|---|
| REP-001A | P0 | Pin Node.js and pnpm versions |
| REP-001B | P0 | Replace broken frontend `next lint` command |
| REP-001C | P0 | Add ESLint flat configuration |
| REP-001D | P1 | Align TypeScript version across workspaces |
| REP-001E | P1 | Add production migration commands |
| REP-002A | P1 | Add frozen-lockfile and dependency checks to CI |
| REP-002B | P1 | Validate native/generated dependencies in clean CI |
| REP-003A | P1 | Add safe archive/export script |

These may be completed as part of `REP-001`, `REP-002`, and `REP-003` rather than tracked as separate top-level milestones.

---

# 10. Final Assessment

| Area | Rating |
|---|---:|
| pnpm workspace structure | 8 / 10 |
| Dependency version consistency | 6 / 10 |
| Backend build setup | 7 / 10 |
| Frontend build setup | 6 / 10 |
| Lint configuration | 1 / 10 |
| Test configuration | 0 / 10 |
| Migration scripts | 5 / 10 |
| Node/runtime reproducibility | 3 / 10 |
| CI readiness | 2 / 10 |
| Overall build readiness | 4 / 10 |

---

# Frozen Decisions from This Audit

1. Node.js and pnpm versions must be explicitly pinned.
2. Next.js 16 uses direct ESLint or Biome commands; `next lint` is prohibited.
3. ESLint flat configuration must exist before CI linting is enabled.
4. Backend and frontend TypeScript versions must be intentionally selected and tested.
5. Unit tests and PostgreSQL integration tests are separate commands.
6. Production uses `prisma migrate deploy`, never `migrate dev`.
7. CI installs with a frozen lockfile.
8. CI validates Prisma generation and migrations from a clean database.
9. Generated folders and secrets are excluded from project archives.
10. Critical remediation code does not begin until the test harness works.

---

# Next Action

Execute `REP-001` in this order:

1. Pin Node.js and pnpm.
2. Fix frontend lint setup.
3. Add backend ESLint flat configuration.
4. Install and configure Jest.
5. Add test scripts.
6. Add the initial test database configuration.
7. Run existing build, typecheck, lint and tests locally.
8. Commit only after all commands pass.
