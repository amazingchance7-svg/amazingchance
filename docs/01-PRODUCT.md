# Product Specification

## Product Overview

Amazing Chance is a transparent online lottery platform focused on trust, fairness, and independently verifiable lottery draws.

The MVP is intentionally simple: users purchase tickets, participate in a weekly draw, and anyone can verify that the draw was conducted fairly.

---

## MVP Objectives

- Sell lottery tickets for USD 1.00.
- Run one draw every week.
- Allocate confirmed revenue deterministically.
- Select three weekly winners using verified external randomness.
- Preserve sufficient evidence to independently audit every draw.
- Build an annual prize fund.

---

## Business Model

Each confirmed ticket purchase is distributed as follows:

- 70% → Weekly Prize Pool
- 20% → Company Revenue
- 10% → Annual Prize Fund

Weekly prize distribution:

- 1st place — 50%
- 2nd place — 30%
- 3rd place — 20%

---

## Ticket Lifecycle

A ticket progresses through the following lifecycle:

1. Purchase initiated
2. Payment completed
3. Ticket allocated
4. Ticket becomes eligible for the draw
5. Draw completed
6. Winners determined
7. Prize paid (future)

Only successfully paid tickets participate in the draw.

---

## Business Rules

- A ticket becomes valid only after successful payment.
- Ticket allocation must be deterministic.
- Ticket numbers must never overlap.
- Every draw must be independently verifiable.
- RANDOM.ORG is the only approved randomness provider for the MVP.
- The MVP does not include a customer wallet.

---

## Out of Scope

The MVP does **not** include:

- Online casino
- Sports betting
- Poker
- Cryptocurrency exchange
- Customer deposit wallets

---

## Open Product Decisions

The following decisions remain open:

- Supported jurisdictions
- Age verification
- Identity verification (KYC)
- Payment provider
- Refund policy
- Prize claim window
- Tax handling
- Annual draw rules
- Responsible gaming controls
- Public verification interface