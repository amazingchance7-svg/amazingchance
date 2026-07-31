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
---

## 5. Purchase State Machine

A purchase represents one attempt to buy a specific number of tickets for one specific draw.

Each purchase must have exactly one current state.

### 5.1 Purchase States

| State | Description |
|---|---|
| `CREATED` | The purchase order has been created but payment processing has not started. |
| `PAYMENT_PENDING` | The user has been redirected to the payment provider or payment confirmation is pending. |
| `PAYMENT_CONFIRMED` | The payment provider has confirmed successful payment. |
| `TICKET_ALLOCATION_PENDING` | Payment is confirmed and ticket creation is waiting to be completed. |
| `COMPLETED` | All purchased tickets have been created and linked to the purchase. |
| `PAYMENT_FAILED` | The payment provider rejected or failed the payment. |
| `EXPIRED` | Payment was not confirmed before the purchase expiration time. |
| `CANCELLED` | The purchase was cancelled before successful payment confirmation. |
| `MANUAL_REVIEW` | The purchase requires fraud, payment, compliance, or technical review. |
| `REFUND_PENDING` | An approved refund or compensating payment operation is being processed. |
| `REFUNDED` | The approved refund has been completed. |

### 5.2 Permitted Purchase Transitions

| Current State | Event | Resulting State |
|---|---|---|
| `CREATED` | Payment session successfully created | `PAYMENT_PENDING` |
| `CREATED` | User cancels before payment | `CANCELLED` |
| `CREATED` | Purchase expiration time reached | `EXPIRED` |
| `PAYMENT_PENDING` | Verified successful payment callback received | `PAYMENT_CONFIRMED` |
| `PAYMENT_PENDING` | Verified failed payment callback received | `PAYMENT_FAILED` |
| `PAYMENT_PENDING` | Payment confirmation deadline reached | `EXPIRED` |
| `PAYMENT_PENDING` | Risk rule requires investigation | `MANUAL_REVIEW` |
| `PAYMENT_CONFIRMED` | Ticket allocation starts | `TICKET_ALLOCATION_PENDING` |
| `PAYMENT_CONFIRMED` | Risk or reconciliation issue detected | `MANUAL_REVIEW` |
| `TICKET_ALLOCATION_PENDING` | All required tickets are created | `COMPLETED` |
| `TICKET_ALLOCATION_PENDING` | Allocation cannot safely continue | `MANUAL_REVIEW` |
| `COMPLETED` | Refund is legally and operationally approved | `REFUND_PENDING` |
| `MANUAL_REVIEW` | Payment confirmed and purchase approved | `PAYMENT_CONFIRMED` |
| `MANUAL_REVIEW` | Purchase rejected before ticket allocation | `CANCELLED` |
| `MANUAL_REVIEW` | Refund approved | `REFUND_PENDING` |
| `REFUND_PENDING` | Refund provider confirms completion | `REFUNDED` |

### 5.3 Purchase Rules

1. A purchase must reference exactly one user and one draw.
2. A purchase must define the requested ticket quantity before payment begins.
3. The purchase amount cannot change after the payment session is created.
4. Tickets may be created only after verified payment confirmation.
5. A payment callback must be authenticated before it changes purchase state.
6. Duplicate payment callbacks must not create duplicate state transitions or duplicate tickets.
7. Each external payment transaction identifier may be linked to only one purchase.
8. A completed purchase must contain exactly the number of tickets paid for.
9. A purchase cannot become `COMPLETED` after sales for its draw have been finalized.
10. A purchase that expires without confirmed payment must not create tickets.
11. A failed or cancelled purchase must not create tickets.
12. A purchase under manual review must not create tickets until explicitly approved.
13. Historical purchase states must not be edited or deleted.
14. Every transition must record its cause, timestamp, source, and correlation identifier.

### 5.4 Late Payment Rule

If payment confirmation is received after ticket sales for the selected draw have closed:

- tickets must not be added to the closed draw;
- the purchase must not be silently reassigned to another draw;
- the payment must be placed into reconciliation or manual review;
- the user must receive a clear status notification;
- the final resolution must be either an approved refund or another legally permitted remedy accepted by the user.

### 5.5 Duplicate Callback Rule

If the payment provider sends the same successful callback more than once:

- the first valid callback may change the state;
- later callbacks with the same provider transaction identifier must be treated as duplicates;
- no additional tickets may be created;
- the duplicate event must be recorded in the audit log;
- the provider must still receive the appropriate technical response to stop unnecessary retries.
