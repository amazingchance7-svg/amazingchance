# 06_Wallet

**Status:** Draft v1.0

---

# Purpose

The Wallet module provides users with a secure and transparent way to store, manage, and spend funds within the Amazing Chance platform.

The Wallet is not a bank account.

The Wallet is an internal balance representation that allows users to purchase lottery tickets quickly without repeating the payment process for every purchase.

The Wallet must provide complete transparency, full auditability, immutable financial history, and deterministic balance calculation.

---

# Business Goal

The Wallet exists to:

- reduce payment friction
- increase ticket purchase conversion
- reduce payment gateway fees
- support refunds
- support promotional bonuses
- support affiliate rewards
- support future subscriptions
- support future cashback
- support future VIP programs
- provide a complete financial history

---

# User Goal

The user should be able to:

- view current balance
- top up balance
- spend balance
- receive winnings
- receive refunds
- receive bonuses
- review transaction history
- filter transactions
- understand every balance change
- never lose transaction history

---

# Scope

Included:

- Wallet balance
- Deposits
- Withdrawals
- Ticket purchases
- Prize payouts
- Refunds
- Bonus credits
- Promotional rewards
- Transaction history
- Ledger synchronization
- Audit logging

Not Included:

- Cryptocurrency wallets
- External bank transfers
- Credit services
- Loans
- Interest
- Investments
- Peer-to-peer transfers

---

# Core Principles

## Principle 1

The Wallet balance is never edited manually.

Balance is always calculated.

---

## Principle 2

Every financial operation creates a Ledger Transaction.

No exceptions.

---

## Principle 3

Transactions are immutable.

They cannot be edited.

They cannot be deleted.

---

## Principle 4

Corrections never modify existing transactions.

Corrections create new transactions.

---

## Principle 5

Every transaction has a unique identifier.

Transaction IDs never change.

---

## Principle 6

The Wallet is only a presentation layer.

The Ledger is the financial truth.

---

## Principle 7

Balance is a derived value.

Balance is never considered the source of truth.

---

## Principle 8

All money movements are traceable.

Every cent must have an origin.

Every cent must have a destination.

---

## Principle 9

Financial history is permanent.

The system never removes historical transactions.

---

## Principle 10

Every operation must be reproducible from Ledger data.

---

# Architecture Overview

Amazing Chance uses an Append-Only Ledger architecture.

Instead of modifying balances directly, the system stores financial events.

Example:

Deposit $50

↓

Ledger

+50

↓

Buy Ticket

-5

↓

Prize

+100

↓

Refund

+2

↓

Current Balance

147

The balance is the mathematical result of all confirmed Ledger transactions.

---

# Wallet Components

The Wallet module consists of:

## Wallet

Stores cached balance information.

Used only for fast reads.

Not authoritative.

---

## Ledger

Stores every financial event.

Append-only.

Immutable.

Single source of truth.

---

## Transaction Engine

Creates Ledger records.

Validates business rules.

Updates Wallet cache.

Writes audit logs.

---

## Audit Log

Stores:

- who performed the action
- when
- request ID
- IP address
- device
- API endpoint
- transaction reference
- previous state
- new state

Audit logs cannot modify Ledger data.

---

## Payment Gateway

Responsible for:

- deposits
- payment confirmation
- payment failures
- refunds

Never modifies Wallet directly.

Only creates financial events.

---

## Prize Engine

Responsible for:

- prize calculation
- payout creation
- payout confirmation

Never edits balances.

Creates Ledger transactions only.

---

# Wallet Data Flow

Deposit

↓

Payment Provider

↓

Payment Verified

↓

Ledger Transaction Created

↓

Wallet Cache Updated

↓

User Balance Updated

---

Ticket Purchase

↓

Balance Validation

↓

Ledger Transaction

↓

Wallet Cache

↓

Ticket Created

---

Prize

↓

Prize Engine

↓

Ledger Transaction

↓

Wallet Cache

↓

Notification

---

Refund

↓

Refund Service

↓

Ledger Transaction

↓

Wallet Cache

↓

User Notification

---

# Wallet Balance

Displayed balance is informational.

Displayed balance is calculated from confirmed Ledger transactions.

Pending transactions never affect available balance unless explicitly supported in future versions.

---

# Balance Types

## Available Balance

Funds immediately available.

---

## Pending Balance

Reserved for future functionality.

Not implemented in MVP.

---

## Locked Balance

Reserved for future functionality.

Not implemented in MVP.

---

# Wallet Screen

The Wallet page displays:

Current Balance

Recent Transactions

Deposit Button

Transaction Filters

Search

Transaction Details

Export (future)

---

# Transaction Categories

The Wallet supports the following categories:

Deposit

Ticket Purchase

Prize

Refund

Bonus

Promotion

Affiliate Reward

Manual Adjustment (Admin)

Correction

System Compensation

---

# Transaction Status

Each transaction has one status.

Possible statuses:

Pending

Confirmed

Failed

Cancelled

Reversed

Only Confirmed transactions affect available balance unless business rules explicitly state otherwise.

---

# Ledger Design

Ledger is append-only.

Existing rows cannot be updated.

Existing rows cannot be deleted.

Corrections always create compensating transactions.

Example

Deposit

+100

Purchase

-5

Correction

+5

History remains complete.

No information is lost.

---

# Functional Requirements

## FR-001 Wallet Overview

The Wallet page shall display:

- Available Balance
- Last Update Timestamp
- Recent Transactions
- Deposit Button
- Transaction Filters

The page must load within normal platform performance requirements.

---

## FR-002 Current Balance

The current balance shall be displayed using two decimal places.

Example:

$0.00

$12.50

$145.90

Negative balances are not allowed in MVP.

---

## FR-003 Deposit Funds

The user can add funds using supported payment methods.

Deposit flow:

User clicks Deposit

↓

Select amount

↓

Choose payment provider

↓

Complete payment

↓

Payment confirmation received

↓

Ledger transaction created

↓

Wallet updated

↓

Balance refreshed

---

## FR-004 Deposit Amounts

Minimum deposit:

Business configuration.

Maximum deposit:

Business configuration.

Allowed preset values may include:

- $5
- $10
- $20
- $50
- $100

Custom amount support is configurable.

---

## FR-005 Successful Deposit

After successful payment the system shall:

Create Ledger Transaction

Update Wallet Cache

Write Audit Log

Refresh Balance

Notify User

---

## FR-006 Failed Deposit

If payment fails:

No Ledger transaction affecting balance shall be created.

Wallet balance remains unchanged.

The user receives an error message.

---

## FR-007 Duplicate Payment Protection

If the payment provider sends the same callback multiple times:

Only one Ledger transaction shall be created.

Duplicate callbacks must be ignored.

Idempotency is mandatory.

---

## FR-008 View Transaction History

The user shall be able to browse complete transaction history.

History is ordered by:

Newest First

Default page size:

20 records.

Pagination shall be supported.

---

## FR-009 Transaction Details

Selecting a transaction displays:

Transaction ID

Type

Status

Amount

Balance After Transaction

Created Date

Reference ID

Description

---

## FR-010 Search Transactions

The user may search using:

Transaction ID

Reference ID

Description

---

## FR-011 Transaction Filters

Available filters:

Deposit

Ticket Purchase

Prize

Refund

Bonus

Promotion

Affiliate Reward

Manual Adjustment

Correction

System Compensation

Date Range

Status

---

## FR-012 Sort Transactions

Supported sorting:

Newest

Oldest

Largest Amount

Smallest Amount

---

## FR-013 Empty Wallet

If no transactions exist:

Display empty state.

Example:

"No transactions yet."

---

## FR-014 Refresh Wallet

Refreshing the page must never create duplicate transactions.

Wallet data is read-only.

---

## FR-015 Wallet Synchronization

If cached balance differs from Ledger calculation:

Ledger becomes authoritative.

Wallet cache shall be rebuilt automatically.

---

## FR-016 Balance Consistency

Displayed balance must always equal:

SUM(Confirmed Credits)

minus

SUM(Confirmed Debits)

No exceptions.

---

## FR-017 Ticket Purchase

When purchasing tickets:

Validate available balance

↓

Create Ledger Debit

↓

Update Wallet

↓

Create Ticket

↓

Return Success

---

## FR-018 Insufficient Funds

If balance is insufficient:

No Ledger transaction is created.

Ticket purchase is rejected.

Balance remains unchanged.

---

## FR-019 Prize Credit

Prize payout shall:

Create Credit Transaction

Update Wallet

Write Audit Log

Notify User

---

## FR-020 Refund

Refund shall:

Create Credit Transaction

Reference original transaction

Update Wallet

Write Audit Log

---

## FR-021 Bonus Credit

Bonus campaigns create:

Credit transaction

Promotion reference

Audit record

---

## FR-022 Affiliate Reward

Affiliate commissions are stored as:

Independent Ledger transactions.

They are not merged with bonuses.

---

## FR-023 Manual Adjustment

Admin adjustments are allowed only through the Admin Panel.

Every adjustment requires:

Reason

Administrator ID

Approval (future)

Audit Log

---

## FR-024 Transaction Immutability

Users cannot edit transactions.

Administrators cannot edit transactions.

Database updates are prohibited.

Corrections require compensating entries.

---

## FR-025 Export History

Reserved for future release.

CSV export.

PDF export.

---

# Business Rules

## BR-001

Wallet balance cannot become negative.

---

## BR-002

Only confirmed transactions affect Available Balance.

---

## BR-003

Pending transactions remain visible but do not change balance.

---

## BR-004

Failed transactions never affect balance.

---

## BR-005

Cancelled transactions never affect balance.

---

## BR-006

Every balance change must have exactly one Ledger transaction.

---

## BR-007

One Ledger transaction affects only one wallet.

---

## BR-008

Every transaction must have a unique immutable ID.

---

## BR-009

Transaction timestamps are stored in UTC.

Displayed using user timezone.

---

## BR-010

Currency is fixed platform currency.

Multi-currency support is outside MVP.

---

## BR-011

Transaction order is chronological.

When timestamps are identical:

Transaction ID determines ordering.

---

## BR-012

Balance recalculation must always produce the same result.

Ledger is deterministic.

---

## BR-013

Deleting Ledger records is prohibited.

---

## BR-014

Editing Ledger records is prohibited.

---

## BR-015

Every correction references the original transaction.

---

## BR-016

Audit Log and Ledger are independent.

Audit never replaces Ledger.

Ledger never replaces Audit.

---

## BR-017

Wallet cache may be rebuilt at any time.

No financial information may be lost.

---

## BR-018

System failures must never create partial financial operations.

Financial operations are atomic.

---

## BR-019

Every API request must be idempotent where applicable.

---

## BR-020

Every financial operation receives a Request ID for traceability.

---

# Data Model

## Wallet

```text
Wallet
------
wallet_id
user_id
cached_balance
currency
status
created_at
updated_at
last_recalculated_at
```

The Wallet table is a read model.

It exists only for fast balance retrieval.

The authoritative financial data is stored in the Ledger.

---

## Ledger Transaction

```text
LedgerTransaction
-----------------
transaction_id
wallet_id
user_id
type
status
direction
amount
currency
balance_after
reference_type
reference_id
description
request_id
created_at
confirmed_at
```

This table is append-only.

Rows must never be updated or deleted.

---

## Audit Log

```text
AuditLog
--------
audit_id
actor_type
actor_id
action
resource
resource_id
request_id
ip_address
device
user_agent
metadata
created_at
```

Audit records do not replace Ledger records.

---

# Transaction Types

| Type | Direction | Description |
|--------|-----------|-------------|
| Deposit | Credit | User deposits funds |
| Ticket Purchase | Debit | Ticket payment |
| Prize | Credit | Lottery winnings |
| Refund | Credit | Refund to wallet |
| Bonus | Credit | Marketing bonus |
| Promotion | Credit | Promotional campaign |
| Affiliate Reward | Credit | Referral reward |
| Manual Adjustment | Credit/Debit | Administrative correction |
| Correction | Credit/Debit | Ledger correction |
| Compensation | Credit | System compensation |

---

# Transaction Statuses

## Pending

Transaction created.

Waiting for confirmation.

---

## Confirmed

Transaction completed.

Balance affected.

---

## Failed

Operation failed.

No balance change.

---

## Cancelled

Operation cancelled before confirmation.

No balance change.

---

## Reversed

Compensating transaction created.

Original transaction remains unchanged.

---

# Security Requirements

## SEC-001

Users may only access their own Wallet.

---

## SEC-002

All Wallet endpoints require authentication.

---

## SEC-003

Authorization is checked on every request.

---

## SEC-004

Wallet IDs must never be guessable.

Use UUIDs.

---

## SEC-005

Transaction IDs must be globally unique.

---

## SEC-006

Every financial API call must include a Request ID.

---

## SEC-007

Replay attacks must be prevented using idempotency.

---

## SEC-008

Payment provider callbacks must be verified using signatures.

---

## SEC-009

Wallet balances must never be trusted from client requests.

The server always calculates the result.

---

## SEC-010

Clients cannot submit balance values.

Only operation requests.

---

## SEC-011

SQL injection protection is mandatory.

---

## SEC-012

Rate limiting shall protect Wallet endpoints.

---

## SEC-013

Sensitive events shall be logged.

---

## SEC-014

Administrative actions require elevated permissions.

---

## SEC-015

Administrative adjustments shall always be audited.

---

# Validation Rules

## VAL-001

Deposit amount must be positive.

---

## VAL-002

Purchase amount must be positive.

---

## VAL-003

Wallet balance cannot become negative.

---

## VAL-004

Currency must match platform configuration.

---

## VAL-005

Duplicate Request IDs must be rejected.

---

## VAL-006

Unknown transaction types are rejected.

---

## VAL-007

Unknown statuses are rejected.

---

## VAL-008

Reference IDs must exist when required.

---

## VAL-009

Transaction amount cannot equal zero.

---

## VAL-010

Balance calculation must be deterministic.

---

# Error States

## ERR-001

Insufficient Funds

---

## ERR-002

Payment Failed

---

## ERR-003

Duplicate Request

---

## ERR-004

Invalid Transaction

---

## ERR-005

Wallet Not Found

---

## ERR-006

Unauthorized

---

## ERR-007

Forbidden

---

## ERR-008

Ledger Synchronization Failed

---

## ERR-009

Payment Verification Failed

---

## ERR-010

Internal Server Error

---

# Wallet UI

The Wallet page shall contain:

## Summary Card

- Current Balance
- Currency
- Last Update

---

## Primary Actions

- Deposit
- Buy Tickets

---

## Transaction Table

Columns:

- Date
- Type
- Description
- Amount
- Status
- Balance After

---

## Filters

- Type
- Status
- Date Range
- Search

---

## Empty State

Display:

No transactions available.

---

## Loading State

Show loading indicator while retrieving transactions.

---

## Error State

Display friendly error message.

Allow retry.

---

# Integration Points

Wallet integrates with:

- Authentication
- Payment Gateway
- Checkout
- Ticket Service
- Lottery Engine
- Prize Engine
- Notification Service
- Admin Panel
- Audit Service

Wallet never communicates directly with external payment providers.

All payment interactions pass through the Payment Service.

---

# Performance Requirements

Wallet balance retrieval:

Target:

<100 ms

---

Transaction history:

First page:

<300 ms

---

Balance recalculation:

Performed asynchronously when required.

---

Ledger queries must support pagination.

---

Wallet cache shall minimize expensive aggregation queries.

---

# Architecture Decisions

## ADR-001

Ledger is the financial source of truth.

---

## ADR-002

Wallet is a cache.

---

## ADR-003

Financial records are immutable.

---

## ADR-004

Corrections use compensating transactions.

---

## ADR-005

Audit and Ledger are separate systems.

---

## ADR-006

Balance is calculated from confirmed transactions.

---

## ADR-007

Append-only architecture is mandatory.

---

# Out of Scope

The following features are intentionally excluded from MVP:

- Withdrawals to bank accounts
- Cryptocurrency
- Multi-currency wallets
- Interest accrual
- Loans
- Credit limits
- Wallet-to-wallet transfers
- Scheduled payments
- Automatic recurring deposits
- Gift cards
- Digital assets
- Staking
- Investment products

---

# Future Enhancements

Potential future functionality:

- Withdrawal requests
- Multi-currency support
- Cashback
- VIP Wallet
- Spending analytics
- Monthly statements
- CSV export
- PDF statements
- Tax reports
- Wallet notifications
- Auto Top-Up
- Promotional campaigns
- Referral payouts
- Reserve balance
- Locked balance
- Escrow support

---

# Acceptance Criteria

The Wallet module is considered complete when:

- Users can deposit funds.
- Users can purchase tickets using Wallet balance.
- Prize payouts are credited automatically.
- Refunds create Ledger credits.
- Every balance change creates exactly one immutable Ledger transaction.
- Wallet balance always matches the sum of confirmed Ledger transactions.
- Transaction history is complete and immutable.
- Duplicate payment callbacks do not create duplicate Ledger entries.
- Every administrative financial action is audited.
- Ledger data can reconstruct a user's balance at any point in time.

---

# End of Document
