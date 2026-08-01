# Amazing Chance

# Architecture Principles

Version: 1.0

Status: Draft

Depends on:

- 00_PROJECT_VISION.md

---

# Purpose

This document defines the architectural principles that every component of Amazing Chance must follow.

These principles are mandatory.

Any deviation requires an approved Architecture Decision Record (ADR).

---

# Principle 1 — Business First

Technology serves business.

Business rules define architecture.

Architecture defines implementation.

Implementation must never redefine business rules.

---

# Principle 2 — Single Source of Truth

Every critical business entity has exactly one authoritative source.

Examples:

Money → PostgreSQL

Purchases → PostgreSQL

Tickets → PostgreSQL

Lottery draws → PostgreSQL

Redis is never the source of truth.

Caches may disappear at any time.

The system must remain correct.

---

# Principle 3 — Explicit State

Every important business object has a clearly defined lifecycle.

State transitions must be:

- deterministic
- validated
- auditable

Illegal transitions are rejected.

---

# Principle 4 — Idempotency

Every externally triggered operation must support retries.

Examples:

Payment callback

Webhook

Purchase confirmation

Ticket allocation

Creating duplicate business operations is forbidden.

---

# Principle 5 — Transactional Consistency

Critical operations execute inside database transactions.

Examples:

Purchase creation

Payment confirmation

Ticket allocation

Winner creation

Audit event creation

If one operation fails:

everything rolls back.

---

# Principle 6 — Separation of Responsibilities

Each module owns its business domain.

Examples:

Auth owns authentication.

Payments own payment processing.

Purchases own purchase lifecycle.

Tickets own ticket creation.

Lottery owns draw lifecycle.

Modules communicate only through defined contracts.

---

# Principle 7 — Deterministic Behaviour

Business logic must produce deterministic results.

The same input must always produce the same output.

Time-dependent behaviour must be explicit.

Random behaviour must be isolated.

---

# Principle 8 — Immutable Audit

Business history must never be silently rewritten.

Instead:

append events.

Do not destroy history.

---

# Principle 9 — Secure by Default

Default configuration must be secure.

Developers should actively opt out of security features.

Never the opposite.

---

# Principle 10 — Fail Fast

Invalid state should be detected immediately.

Never continue execution after detecting corrupted business state.

---

# Principle 11 — Observable System

Every important action should generate logs, metrics or audit events.

Production debugging must never depend on guessing.

---

# Principle 12 — Version Everything

Version:

APIs

Provably Fair algorithm

Randomness algorithm

Database migrations

Documentation

Breaking changes require version increments.

---

# Principle 13 — Simplicity

Prefer simple solutions.

Complexity must have measurable business value.

Avoid premature optimization.

---

# Principle 14 — Testability

Business logic must be independently testable.

Controllers should remain thin.

Infrastructure should be replaceable.

Business rules must not depend on frameworks.

---

# Principle 15 — Long-Term Maintainability

Amazing Chance is expected to evolve for many years.

Every implementation decision should reduce future maintenance costs.

Temporary shortcuts require explicit documentation through ADR.

---

# Compliance

Every Pull Request should be reviewed against this document.

Code violating these principles should not be merged.