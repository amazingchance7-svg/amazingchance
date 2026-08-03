# ADR 0009 — Immutable balanced ledger

## Status

Accepted.

## Context

Amazing Chance must not treat a ticket as an independently creatable
business object. A ticket is a consequence of a verified payment,
a balanced financial recognition entry, a completed purchase-state
transition, and an atomic ticket-allocation operation.

The existing schema already contains `LedgerTransaction` and
`LedgerPosting`, but without database-enforced balance, sealing or
append-only behavior.

## Decision

1. PostgreSQL remains the financial system of record.
2. Every ledger transaction is assembled and sealed inside one SQL
   transaction.
3. A sealed ledger transaction:
   - contains at least two postings;
   - has equal debit and credit totals;
   - contains only positive posting amounts;
   - cannot be updated or deleted;
   - cannot receive additional postings.
4. `LedgerService.append()` is the only application service for new
   ledger entries and is idempotent.
5. Tickets will be issued only by the later verified
   payment-to-ledger-to-ticket orchestration. This ADR does not expose
   any ticket-creation API.
6. Snapshot and Merkle-root work will consume finalized ticket data
   only after the payment and ticket invariants are complete.

## Consequences

- Invalid or partial ledger writes fail at transaction commit.
- Direct Prisma or SQL mutation of committed ledger history is blocked.
- Future payment processing can make payment recognition, purchase
  completion, ledger creation and ticket issuance one controlled
  serializable transaction.
- This is a foundation, not the payment-provider integration itself.
