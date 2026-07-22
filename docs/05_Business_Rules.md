# Business Rules

## 1. Purpose

This document defines the mandatory business rules, system states, permitted state transitions, restrictions, failure scenarios, and audit requirements of the Amazing Chance platform.

These rules are binding for product design, software development, testing, administration, financial operations, and future platform changes.

No feature, administrative action, or technical implementation may violate the rules defined in this document.

---

## 2. MVP Business Model

Amazing Chance MVP does not use a general-purpose deposit wallet.

Users do not deposit funds into an account for future unrestricted use.

Each payment is linked to a specific ticket purchase order.

The standard purchase flow is:

1. The user selects the number of tickets.
2. The system creates a purchase order.
3. The payment provider processes the exact order amount.
4. The system waits for verified payment confirmation.
5. Tickets are created only after successful payment confirmation.
6. The purchase order is completed after all tickets have been allocated.

Prize funds are recorded separately from ticket purchase payments.

Transfers of funds, balances, tickets, prizes, or accounts between users are prohibited.

A full deposit wallet may only be introduced in a later development phase after separate legal, AML, financial, and architectural approval.

---

## 3. Rule Format

Every business rule must define:

- **Current State** — the state of the entity before the event;
- **Event** — the action or confirmed external event;
- **Required Conditions** — conditions that must be satisfied;
- **Resulting State** — the state after successful processing;
- **Failure Result** — the required response if processing fails;
- **Audit Record** — information that must be stored.

State transitions not explicitly permitted by this document are prohibited.

---

## 4. Core Invariants

The following rules apply to the entire platform:

1. Every ticket has one globally unique identifier.
2. Every ticket belongs to exactly one draw.
3. Every ticket is linked to exactly one completed purchase.
4. A payment confirmation may be processed only once.
5. One purchase cannot create tickets more than once.
6. Tickets cannot be created before verified payment confirmation.
7. Tickets cannot be added to a draw after ticket-set finalization.
8. Finalized draw data cannot be edited or deleted.
9. Winners cannot be selected, replaced, or modified manually.
10. Every state transition must create an audit record.
11. Financial records are immutable.
12. Corrections must use compensating records rather than editing historical records.
13. Administrative permissions cannot override draw integrity rules.
14. Public draw results must be independently reproducible.
15. Transfers between user accounts are prohibited.
