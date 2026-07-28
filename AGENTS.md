# Amazing Chance — AI Development Guide

## Purpose
This file is the primary instruction set for AI coding agents and developers working in this repository.

Before modifying code, read `AGENTS.md`, the relevant files under `docs/`, and the existing source code and tests. Do not invent business rules. When requirements are unclear, stop and ask.

## Product rules
- Ticket price: USD 1.00
- Weekly draws
- Confirmed ticket revenue allocation: 70% weekly prize pool, 20% company revenue, 10% annual prize fund
- Weekly prize distribution: 50% first winner, 30% second winner, 20% third winner
- RANDOM.ORG is the only approved randomness provider
- Finalized ticket snapshots are immutable
- No internal customer wallet in MVP
- Annual participation is derived from confirmed eligible tickets and explicit business rules

These rules must not change without an approved product decision and ADR.

## Stack
- pnpm monorepo
- TypeScript strict mode
- NestJS backend
- Next.js frontend
- Prisma 7
- PostgreSQL
- Redis
- Docker Compose

## Architecture
The MVP is a modular monolith. Keep business logic in services, not controllers. Prisma is the approved database access layer. Do not add a repository abstraction or raw SQL without a documented reason. Do not introduce microservices during MVP without an ADR.

## Money and accounting
- Never use floating-point values for money.
- Use integer minor units and ISO 4217 currency codes.
- Allocation must be deterministic and auditable.
- Rounding must be explicit and tested.
- Ledger records are append-only.

## Lottery integrity
- A ticket is eligible only after confirmed payment.
- Tickets are uniquely numbered within a draw.
- Sales close before snapshot finalization.
- A finalized snapshot cannot change.
- Store a canonical representation and cryptographic hash.
- Store and verify randomness evidence.
- Winner selection must be deterministic from the finalized snapshot and verified randomness.
- Draw execution must be idempotent.
- Integrity uncertainty must move the draw to manual review.

## Payments
- Payment creation and webhook processing must be idempotent.
- Verify webhook signatures.
- Reject duplicate provider events.
- Never issue tickets from an unverified client redirect.
- Preserve refund history and explicitly update ticket eligibility.
- Never store full card details.

## Security
- Validate every external input.
- Apply authentication and authorization explicitly.
- Never commit secrets or production credentials.
- Use environment variables and maintain `.env.example`.
- Add rate limiting to sensitive endpoints.
- Avoid leaking internal errors or personal data.
- Security-sensitive operations create audit records.

## Code quality
- Keep TypeScript strict.
- Avoid `any`.
- Use DTOs and runtime validation at API boundaries.
- Prefer explicit state transitions.
- Add tests for business rules and failure cases.
- Never weaken linting, typing, or tests to make a change pass.

## Database changes
For every schema change: update Prisma schema, create a named migration, review SQL, regenerate Prisma Client, run checks, and update documentation. Never rewrite an applied production migration.

## Required verification
Run applicable commands before completion:
```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```
For Prisma changes:
```bash
pnpm --filter @amazing-chance/api prisma validate
pnpm --filter @amazing-chance/api prisma generate
```
State clearly when a command could not be run.

## Scope discipline
Implement one coherent task at a time. Do not perform unrelated refactoring, rename public contracts without approval, or add speculative features.

## Git
Use focused conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Completion report
Report files changed, behavior implemented, commands run, test results, and remaining risks.
