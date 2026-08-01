# Amazing Chance — Platform Principles

**Version:** 2.0  
**Status:** Active  
**Scope:** Product integrity, financial integrity, lottery integrity, administrative limits, privacy, and public verifiability  
**Authority:** Mandatory unless superseded by an approved ADR

---

## 1. Purpose

This document defines the platform-level invariants that every Amazing Chance feature and implementation must preserve.

It does not replace:

- `docs/01-PRODUCT.md` for the approved product model;
- `docs/05_Business_Rules.md` for state machines and business rules;
- `docs/00_System_Architecture.md` for system architecture;
- `docs/STANDARDS.md` for engineering implementation standards;
- `docs/audits/REMEDIATION_PLAN.md` for corrective work and execution order.

This document contains only the non-negotiable principles that describe what the platform must never violate.

---

## 2. Approved MVP Model

Amazing Chance uses direct payment for each ticket purchase.

The MVP does not include:

- a customer wallet;
- stored customer balances;
- customer deposits for future purchases;
- internal transfers between users;
- virtual credits;
- internal ticket resale.

Each payment is linked to one specific purchase for one specific draw.

The approved allocation of confirmed eligible ticket revenue is:

- 70% — Weekly Prize Pool;
- 20% — Company Revenue;
- 10% — Annual Prize Fund.

The approved weekly prize distribution is:

- 1st place — 50%;
- 2nd place — 30%;
- 3rd place — 20%.

Only successfully paid and eligible tickets may participate in a draw.

---

## 3. Integrity Over Availability

Platform integrity has priority over availability, convenience, speed, and manual intervention.

If the platform cannot safely determine whether a critical operation is valid, it must reject, pause, or place that operation into controlled review.

The platform must not continue a financial, ticket, draw, winner, or payout operation when its correctness cannot be established.

A temporary interruption is preferable to an irreversible or unverifiable result.

---

## 4. No Manual Critical Outcomes

No administrator, developer, employee, owner, support agent, or privileged user may manually create or alter a critical platform outcome.

Manual control must not permit a person to:

- mark an unpaid purchase as paid;
- issue confirmed tickets;
- change ticket ownership or ticket numbers;
- add tickets after draw finalization;
- modify confirmed financial records;
- edit ledger history;
- change accepted randomness evidence;
- select or replace winners;
- modify a completed prize amount;
- modify published draw results;
- delete immutable audit evidence.

Administrative tools may support observation, approval workflows, investigation, legally required review, and explicitly controlled recovery operations.

They must not bypass platform invariants.

---

## 5. Payment Before Ticket Issuance

Tickets may be issued only after authenticated and verified payment confirmation.

A browser redirect, client-side response, administrator action, or unverified provider message is not payment confirmation.

Before ticket issuance, the platform must validate the applicable provider evidence, including:

- provider authenticity;
- purchase reference;
- merchant or account reference;
- exact amount;
- currency;
- event identity;
- replay status.

A failed, expired, cancelled, duplicated, unresolved, or unverifiable payment must not create eligible tickets.

---

## 6. Exact and Idempotent Ticket Issuance

One confirmed purchase must produce exactly the number of tickets paid for.

The platform must guarantee:

- one purchase receives at most one ticket allocation;
- ticket identifiers are unique;
- ticket numbers do not overlap within a draw;
- retries do not create duplicate tickets;
- partial ticket issuance is rolled back;
- every issued ticket is traceable to one purchase, one user, and one draw;
- issuance and purchase completion are completed atomically.

Ticket supply must not be described as finite unless a future approved product rule explicitly introduces a finite limit.

Regulatory, responsible-participation, fraud, provider, or technical limits may still restrict purchases.

---

## 7. Immutable Financial History

Confirmed financial history must not be overwritten or silently deleted.

This includes, where applicable:

- confirmed payments;
- allocation records;
- ledger transactions;
- ledger postings;
- refunds;
- chargebacks;
- prize obligations;
- payouts;
- reconciliation records.

Corrections must use new compensating records.

The MVP has no customer wallet, but the platform may maintain internal ledger accounts and calculated financial positions for:

- Weekly Prize Pool;
- Company Revenue;
- Annual Prize Fund;
- refunds;
- prize obligations;
- payouts;
- provider reconciliation.

Internal ledger accounts must not be exposed or represented as customer deposit balances.

---

## 8. Double-Entry and Deterministic Allocation

Every financial event that affects platform funds must be recorded through controlled, auditable accounting.

Ledger transactions must be:

- balanced;
- append-only;
- idempotent;
- currency-consistent;
- linked to the originating business event.

The approved 70% / 20% / 10% allocation must be applied deterministically to eligible confirmed revenue according to a versioned allocation rule.

Historical allocation records must retain the exact rule version used.

---

## 9. Immutable Ticket and Draw Evidence

After a ticket is issued, its core identity must remain immutable.

Core ticket identity includes:

- public ticket identifier;
- purchase;
- user;
- draw;
- sequential number;
- issuance timestamp.

Status changes may affect eligibility, but they must not erase historical issuance.

After ticket sales close, the platform must create a deterministic eligible-ticket snapshot.

After finalization:

- the snapshot is immutable;
- snapshot entries are immutable;
- no ticket may be added;
- no ticket may appear more than once;
- the canonical format is versioned;
- the hash algorithm is versioned;
- the published snapshot hash must remain permanent.

---

## 10. Verified External Randomness

The approved randomness provider for the MVP is RANDOM.ORG.

The platform must store sufficient evidence to verify the accepted randomness result, including applicable:

- request data;
- response data;
- provider signature;
- signature-verification result;
- requested range;
- requested count;
- returned positions or values;
- timestamps;
- normalization method;
- evidence hash;
- provider and algorithm versions.

The platform must not silently replace RANDOM.ORG with another provider during a draw.

Any fallback model requires a separate approved product, legal, security, and architectural decision.

---

## 11. Deterministic Winner Selection

Winner selection must use only approved immutable inputs.

The required inputs are:

- the finalized eligible-ticket snapshot;
- the accepted verified randomness evidence;
- the versioned deterministic winner-selection algorithm.

The same inputs and algorithm version must always produce the same winners.

The platform must reject:

- out-of-range positions;
- incorrect winner counts;
- malformed randomness evidence;
- duplicate positions where uniqueness is required;
- any attempt to supply winners manually.

Winner records must be immutable after draw completion.

---

## 12. Public Verifiability Without Personal Exposure

Amazing Chance must preserve enough evidence for an independent party to verify a completed draw.

Public verification should support confirmation of:

- draw identity;
- sales closure;
- finalized ticket count;
- snapshot hash;
- randomness evidence;
- normalized positions;
- algorithm version;
- winning public ticket identifiers;
- prize distribution;
- publication time.

Public verification must not require exposing:

- legal names;
- email addresses;
- phone numbers;
- home addresses;
- payment information;
- identity documents;
- private internal identifiers;
- precise location data.

Public winner identity fields, public nicknames, country display, or public activity maps are not platform invariants and require separate approved product and privacy decisions.

---

## 13. Explicit State Machines

Critical entities must change state only through explicit, validated transitions.

This applies to:

- users;
- purchases;
- payments;
- tickets;
- draws;
- snapshots;
- prizes;
- payouts.

State transitions must be:

- authorized;
- deterministic;
- atomic where required;
- idempotent;
- concurrency-safe;
- auditable.

Direct arbitrary status updates are prohibited.

The authoritative transition rules are defined in `docs/05_Business_Rules.md`.

---

## 14. Idempotency and Safe Retries

Every externally triggered critical operation must support safe retries.

This includes, where applicable:

- purchase creation;
- payment-session creation;
- webhook processing;
- payment confirmation;
- ticket allocation;
- refund processing;
- snapshot finalization;
- randomness acquisition;
- winner selection;
- prize creation;
- payout processing.

Repeating the same valid request must not create duplicate business results.

Duplicate requests and provider events must remain traceable in audit history.

---

## 15. Atomic Critical Workflows

Operations that must succeed together must execute inside one controlled transaction boundary.

A confirmed-payment workflow may include:

- claiming the provider event;
- validating the purchase;
- recording the payment;
- transitioning purchase state;
- applying the allocation rule;
- creating ledger entries;
- reserving the ticket range;
- creating tickets;
- recording state events;
- recording audit events;
- recording outbox events;
- completing the purchase.

Either the complete transaction succeeds or none of its state changes are committed.

External network calls must not remain open inside long-running database transactions.

---

## 16. Least Privilege and Deny by Default

All access is deny-by-default.

Users, administrators, workers, services, and integrations receive only the permissions required for their responsibilities.

Authentication alone does not authorize privileged operations.

Administrative permissions must be explicit and auditable.

Sensitive production access should require:

- strong authentication;
- multi-factor authentication;
- time-limited authorization where appropriate;
- explicit reason recording;
- full audit logging;
- separation of duties for high-risk operations where practical.

No unrestricted “god mode” may alter financial or lottery outcomes.

---

## 17. Immutable Audit History

Every material financial, ticket, draw, winner, security, and administrative action must create an audit record.

Audit records must identify, where applicable:

- actor or service;
- target;
- action;
- previous state;
- new state;
- reason;
- timestamp;
- correlation identifier;
- result;
- relevant version information.

Audit records must be append-only and access-controlled.

They must not be editable through normal administration tools.

---

## 18. Privacy by Design

The platform must minimize the collection, exposure, and retention of personal data.

Private and public representations must remain separated.

Personal data may be processed only for an approved legal, operational, security, payment, identity, or payout purpose.

Jurisdiction-dependent requirements such as:

- KYC;
- age verification;
- sanctions screening;
- responsible-participation controls;
- retention periods;
- public winner information;
- tax records

must not be treated as finalized until formally approved.

---

## 19. Single Source of Truth

PostgreSQL is the authoritative source for critical business state.

Redis, caches, queues, logs, analytics, or external provider dashboards must not become an alternative source of truth for:

- payments;
- purchases;
- tickets;
- draws;
- snapshots;
- randomness evidence;
- winners;
- prizes;
- payouts;
- ledger history;
- audit history.

Each business entity has one authoritative owning module.

Modules must not directly mutate another module’s lifecycle state outside approved application commands.

---

## 20. Failure Safety and Recovery

A technical failure must not result in:

- unpaid eligible tickets;
- duplicate tickets;
- overlapping ticket numbers;
- partial financial allocation;
- unbalanced ledger transactions;
- partial snapshots;
- unverifiable randomness acceptance;
- duplicate winners;
- duplicate prizes;
- duplicate payouts;
- missing audit evidence.

Failed operations must remain observable, auditable, and safely retryable.

Recovery must resume from the last committed state without repeating completed critical operations.

---

## 21. Versioned Critical Rules

Critical rules and evidence formats must be versioned.

This includes:

- allocation rules;
- ticket-snapshot format;
- snapshot hash algorithm;
- randomness normalization;
- winner-selection algorithm;
- public verification format;
- APIs where applicable;
- database migrations.

A completed historical operation must retain the exact versions used at execution time.

---

## 22. Open Decisions Must Remain Open

An unresolved product, legal, financial, privacy, or operational decision must not be documented as implemented or approved.

The following remain subject to separate approval unless another authoritative document records a final decision:

- operating jurisdiction;
- licensing model;
- payment provider;
- refund policy;
- KYC and age-verification rules;
- responsible-participation limits;
- prize claim window;
- payout process;
- tax handling;
- annual draw rules;
- public winner identity;
- public geographic activity display;
- fallback randomness model.

Implementation must not silently decide these matters.

---

## 23. Architecture Decision Rule

A feature or implementation that conflicts with these principles must not proceed until:

1. the conflict is identified;
2. product, legal, financial, security, and operational impacts are reviewed where applicable;
3. an ADR records the approved exception or change;
4. affected authoritative documentation is updated;
5. tests prove the revised invariant.

Convenience, speed, or administrative power must never silently override platform integrity.

---

## 24. Related Documentation

- `docs/01-PRODUCT.md`
- `docs/03_Product_Map.md`
- `docs/05_Business_Rules.md`
- `docs/00_System_Architecture.md`
- `docs/01_ENGINEERING_PRINCIPLES.md`
- `docs/STANDARDS.md`
- `docs/audits/REMEDIATION_PLAN.md`
- `docs/ADR/`
