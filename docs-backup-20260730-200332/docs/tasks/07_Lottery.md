# 07_Lottery

**Status:** Draft v1.0

---

# Purpose

The Lottery module defines how lottery games are created, managed, completed, verified, and archived within the Amazing Chance platform.

It is the core business module of the system.

Every ticket purchase, jackpot calculation, winner selection, and prize distribution originates from the Lottery module.

The Lottery module is responsible for ensuring fairness, transparency, predictability of business rules, and complete auditability.

---

# Business Goal

The Lottery module exists to:

- provide weekly lottery draws
- manage jackpot growth
- distribute prizes fairly
- guarantee transparent winner selection
- prevent fraud
- ensure deterministic draw execution
- provide public verification
- maintain complete historical records
- automate draw operations
- maximize user trust

---

# User Goal

Users should be able to:

- participate in weekly draws
- know when a draw closes
- know when winners are selected
- verify that the draw was fair
- see prize distribution
- view previous draws
- check jackpot size
- understand draw rules
- trust the platform

---

# Scope

Included:

- Lottery creation
- Weekly draws
- Jackpot calculation
- Ticket participation
- Draw execution
- Winner selection
- Prize allocation
- Draw history
- Public verification
- Draw archive

Not Included:

- Instant lotteries
- Scratch cards
- Sports betting
- Casino games
- Live dealer games
- Progressive multi-game jackpots

---

# Architecture Overview

The Lottery module coordinates multiple platform services.

It does not generate payments directly.

It communicates with:

- Ticket Service
- Wallet
- Draw Engine
- Prize Engine
- Notification Service
- Admin Panel
- Audit Service

Lottery acts as the business orchestrator.

---

# Lottery Lifecycle

Lottery Created

↓

Lottery Published

↓

Ticket Sales Open

↓

Users Purchase Tickets

↓

Ticket Sales Close

↓

Draw Starts

↓

Random Seed Finalized

↓

Winning Numbers Generated

↓

Winners Determined

↓

Prizes Calculated

↓

Wallet Credits Created

↓

Notifications Sent

↓

Lottery Archived

---

# Lottery Frequency

MVP supports:

Weekly Lottery

One active lottery at a time.

Future versions may support multiple concurrent lotteries.

---

# Lottery States

Each lottery has exactly one state.

Possible states:

Draft

Scheduled

Open

Sales Closed

Drawing

Completed

Cancelled

Archived

State transitions are strictly controlled.

A lottery cannot skip required states.

---

# Lottery Creation

A lottery is created by the system administrator.

Required information includes:

- Draw Name
- Draw Date
- Ticket Price
- Jackpot Rules
- Prize Distribution
- Sales Opening Time
- Sales Closing Time

Once published, business-critical parameters become immutable.

---

# Lottery Publication

Publishing a lottery:

- makes it visible
- allows ticket sales
- initializes jackpot
- enables countdown timer
- creates audit record

---

# Ticket Sales

Tickets may only be purchased while the lottery is in the Open state.

Ticket purchases automatically stop when sales close.

No manual intervention is required.

---

# Sales Closing

At the configured closing time:

- ticket sales stop
- checkout is disabled
- wallet purchases are rejected
- ticket generation stops
- draw preparation begins

Previously issued tickets remain valid.

---

# Draw Preparation

Before drawing begins the system verifies:

- lottery is active
- sales are closed
- ticket database is consistent
- jackpot calculation completed
- hash published
- random seed locked
- audit snapshot created

  ----

  # Draw Execution

The Draw Execution phase determines the winning results for the current lottery.

The process must be fully automated.

Manual intervention is prohibited after the draw has started.

---

# Draw Preconditions

The draw may begin only if all conditions are satisfied.

Required conditions:

- Lottery State = Sales Closed
- Sales Closing Time reached
- Ticket database validated
- Jackpot calculated
- Prize structure validated
- Hash published
- Random seed locked
- No unresolved financial inconsistencies

If any validation fails:

The draw is suspended.

An audit record is created.

Administrators are notified.

---

# Draw Engine

The Draw Engine is responsible for:

- initializing the draw
- generating randomness
- selecting winners
- validating results
- creating immutable draw records
- publishing results

The Draw Engine never modifies tickets.

The Draw Engine never edits lottery parameters.

---

# Winning Ticket Selection

Every valid ticket purchased before sales closing participates.

Invalid tickets are excluded.

Cancelled tickets are excluded.

Refunded tickets are excluded according to business rules.

Each ticket participates exactly once.

---

# Equal Probability

Every eligible ticket has identical probability of winning.

Probability must never depend on:

- purchase time
- payment method
- wallet balance
- country
- device
- browser
- operating system
- referral source
- user status

---

# Randomness

Winner selection must use a cryptographically secure random source.

Pseudo-random generators without cryptographic guarantees are prohibited.

The generated randomness shall be:

- unpredictable
- unbiased
- reproducible for verification
- publicly auditable

---

# Provably Fair Principle

Amazing Chance uses a Provably Fair architecture.

Users must be able to verify that:

- the platform did not manipulate the draw
- the published hash matches the revealed seed
- winners were generated correctly
- no ticket was added after sales closed

---

# Seed Lifecycle

The draw uses:

Server Seed

Client-independent Random Value

Timestamp

Lottery Identifier

These values produce the final random source.

---

# Server Seed

Before ticket sales close:

The system generates a secret Server Seed.

The seed remains hidden.

The SHA-256 hash of the seed is published publicly.

The seed itself is revealed only after the draw.

---

# Hash Publication

Published information:

Lottery ID

Hash

Publication Time

Hash Algorithm

Once published:

The hash can never change.

---

# Seed Reveal

After the draw:

The system publishes:

Server Seed

Hash

Verification instructions

Users can independently verify:

SHA-256(Server Seed)

equals

Published Hash

---

# Draw Record

Each completed draw creates an immutable record.

The record includes:

Draw ID

Lottery ID

Execution Time

Random Seed

Hash

Winning Tickets

Jackpot

Prize Distribution

Execution Duration

Verification Status

---

# Winner Determination

After randomness is generated:

Eligible tickets are ordered.

Winning positions are selected.

Prize allocation begins.

---

# Duplicate Winners

A ticket may win only once in a single draw.

A user may win multiple prizes only if different tickets qualify.

---

# Prize Structure

MVP distribution:

1st Place

50%

2nd Place

30%

3rd Place

20%

Percentages are configurable.

The total must always equal 100%.

---

# Jackpot Calculation

Jackpot is finalized immediately before the draw.

Formula:

Previous Jackpot Carryover

+

Current Lottery Contribution

-

Reserved Amounts

The finalized jackpot becomes immutable.

---

# Prize Calculation

Prize values are calculated from:

Final Jackpot

×

Configured Percentage

Example:

Jackpot

$100,000

↓

1st Prize

$50,000

↓

2nd Prize

$30,000

↓

3rd Prize

$20,000

---

# Prize Allocation

Each winner receives:

Prize Amount

Wallet Credit

Notification

Ledger Transaction

Audit Record

Prize creation is atomic.

Partial prize allocation is prohibited.

---

# No Winners

If business rules allow:

The jackpot rolls over to the next lottery.

Otherwise:

Alternative distribution rules apply.

MVP assumes at least one winner exists.

---

# Draw Completion

A draw is complete only after:

- winners determined
- prizes calculated
- wallet credits created
- notifications queued
- audit finalized
- results published

Only then does the lottery state become Completed.

---

# Business Rules

## BR-001

Only one active lottery may exist in MVP.

---

## BR-002

A lottery must have a unique Lottery ID.

---

## BR-003

Lottery parameters become immutable after publication.

---

## BR-004

Ticket sales are allowed only while the lottery status is Open.

---

## BR-005

No tickets may be created after Sales Closed.

---

## BR-006

Every purchased ticket automatically participates in the current lottery.

---

## BR-007

A ticket belongs to exactly one lottery.

---

## BR-008

A lottery may contain unlimited tickets.

---

## BR-009

Ticket ownership never changes after purchase.

---

## BR-010

Winning tickets are immutable.

---

## BR-011

Lottery results can never be recalculated after publication.

---

## BR-012

Prize percentages must always total 100%.

---

## BR-013

Jackpot amount becomes immutable before winner selection.

---

## BR-014

Lottery history cannot be deleted.

---

## BR-015

Draw history cannot be modified.

---

## BR-016

Every draw generates exactly one immutable Draw Record.

---

## BR-017

Every completed draw creates an Audit Record.

---

## BR-018

All timestamps are stored in UTC.

---

## BR-019

Lottery state transitions are sequential.

Skipping states is prohibited.

---

## BR-020

Cancelled lotteries cannot be reopened.

---

## BR-021

Archived lotteries are read-only.

---

## BR-022

Winning tickets remain permanently associated with their prizes.

---

## BR-023

Every published lottery is publicly visible.

---

## BR-024

Lottery IDs must never be reused.

---

## BR-025

A completed lottery cannot return to any previous state.

---

# Functional Requirements

## FR-001 Lottery Creation

Administrators can create a new lottery.

Required fields:

- Name
- Draw Date
- Ticket Price
- Sales Opening Time
- Sales Closing Time
- Prize Distribution

---

## FR-002 Publish Lottery

Publishing a lottery shall:

- validate configuration
- assign Lottery ID
- initialize jackpot
- create audit record
- change state to Open at scheduled time

---

## FR-003 View Lottery

Users can view:

- current jackpot
- ticket price
- draw countdown
- draw date
- remaining sales time

---

## FR-004 Active Lottery

The system shall always identify one active lottery in MVP.

---

## FR-005 Ticket Participation

Every confirmed ticket automatically joins the active lottery.

No manual registration is required.

---

## FR-006 Close Sales

At the configured closing time:

- checkout becomes unavailable
- wallet purchases stop
- ticket creation stops

---

## FR-007 Start Draw

The Draw Engine automatically starts after all preconditions are satisfied.

---

## FR-008 Generate Winners

Winning tickets are selected automatically.

Manual selection is prohibited.

---

## FR-009 Publish Results

Completed draw results shall display:

- winners
- jackpot
- prize values
- draw timestamp
- verification hash

---

## FR-010 Lottery History

Users may browse previous lotteries.

Each lottery displays:

- date
- jackpot
- winners
- ticket count
- verification information

---

## FR-011 Search Lottery

Users may search by:

- Lottery ID
- Date
- Status

---

## FR-012 Jackpot Display

Current jackpot updates automatically after every confirmed ticket purchase.

---

## FR-013 Countdown

A countdown timer shall display time remaining until ticket sales close.

---

## FR-014 Lottery Archive

Completed lotteries are moved into the archive automatically.

---

## FR-015 Verification Page

Each completed lottery has a public verification page.

The page includes:

- Hash
- Server Seed
- Verification instructions
- Winning tickets
- Draw information

---

## FR-016 Cancel Lottery

Administrators may cancel a lottery before ticket sales close.

Cancellation creates:

- audit record
- status update
- notification

---

## FR-017 Draw Recovery

If the draw process is interrupted:

The Draw Engine resumes from the latest completed checkpoint.

Duplicate execution is prohibited.

---

## FR-018 Public Transparency

Users may verify:

- draw integrity
- published hash
- revealed seed
- winner generation

Without administrator assistance.

---

## FR-019 Lottery Statistics

Lottery statistics include:

- tickets sold
- participating users
- jackpot
- prize distribution

---

## FR-020 Audit Logging

Every lottery lifecycle event generates an Audit Log entry.

---

# Security Requirements

## SEC-001

Lottery configuration changes require administrator permissions.

---

## SEC-002

Draw execution requires system authorization only.

---

## SEC-003

Winning ticket generation cannot be manually triggered outside authorized workflows.

---

## SEC-004

Lottery publication is logged.

---

## SEC-005

Lottery cancellation is logged.

---

## SEC-006

Every draw receives a unique Draw ID.

---

## SEC-007

Verification hashes cannot be modified after publication.

---

## SEC-008

Random seeds remain confidential until reveal.

---

## SEC-009

Lottery history is publicly readable but never editable.

---

## SEC-010

Administrative overrides are prohibited after draw execution begins.

---

# Validation Rules

## VAL-001

Lottery Name is required.

---

## VAL-002

Ticket Price must be greater than zero.

---

## VAL-003

Sales Opening Time must occur before Sales Closing Time.

---

## VAL-004

Sales Closing Time must occur before Draw Time.

---

## VAL-005

Prize Distribution percentages must total exactly 100%.

---

## VAL-006

Lottery ID must be unique.

---

## VAL-007

Draw ID must be unique.

---

## VAL-008

Lottery State must be valid.

---

## VAL-009

Winning Tickets must belong to the current lottery.

---

## VAL-010

Only Confirmed Tickets participate in the draw.

---

## VAL-011

Cancelled tickets are excluded.

---

## VAL-012

Refunded tickets follow configured business rules.

---

## VAL-013

Jackpot value cannot be negative.

---

## VAL-014

Draw cannot start before ticket sales close.

---

## VAL-015

Hash must exist before draw execution.

---

# Error States

## ERR-001

Lottery Not Found

---

## ERR-002

Lottery Already Closed

---

## ERR-003

Ticket Sales Closed

---

## ERR-004

Lottery Already Completed

---

## ERR-005

Invalid Lottery State

---

## ERR-006

Invalid Draw Configuration

---

## ERR-007

Jackpot Calculation Failed

---

## ERR-008

Winner Generation Failed

---

## ERR-009

Hash Verification Failed

---

## ERR-010

Draw Interrupted

---

## ERR-011

Draw Recovery Failed

---

## ERR-012

Lottery Cancelled

---

## ERR-013

Duplicate Lottery

---

## ERR-014

Prize Allocation Failed

---

## ERR-015

Unexpected Internal Error

---

# Data Model

## Lottery

```text
Lottery
-------
lottery_id
name
status
ticket_price
jackpot
currency
sales_open_at
sales_close_at
draw_at
created_at
updated_at
published_at
completed_at
```

---

## Draw

```text
Draw
----
draw_id
lottery_id
status
server_seed
server_seed_hash
public_random_value
verification_hash
started_at
completed_at
execution_time_ms
created_at
```

---

## Prize Tier

```text
PrizeTier
---------
tier_id
lottery_id
position
percentage
fixed_amount
created_at
```

---

## Winner

```text
Winner
------
winner_id
draw_id
ticket_id
user_id
position
prize_amount
wallet_transaction_id
created_at
```

---

# UI Requirements

## Current Lottery Page

Displays:

- Lottery Name
- Jackpot
- Ticket Price
- Countdown
- Sales Status
- Draw Date
- Buy Ticket Button

---

## Countdown Timer

The timer updates automatically.

Displays:

- Days
- Hours
- Minutes
- Seconds

When sales close:

The Buy Ticket button becomes disabled.

---

## Draw Status

Possible statuses:

- Coming Soon
- Open
- Closing Soon
- Drawing
- Completed
- Cancelled

---

## Jackpot Display

Current jackpot is always visible.

Updates automatically after confirmed ticket purchases.

---

## Prize Table

Displays:

| Position | Prize |
|----------|-------|
| 1st | 50% |
| 2nd | 30% |
| 3rd | 20% |

---

## Lottery History

Users may browse completed lotteries.

Each record displays:

- Draw Date
- Jackpot
- Tickets Sold
- Winners
- Verification

---

## Verification Page

Displays:

- Lottery ID
- Draw ID
- Published Hash
- Server Seed
- Verification Result
- Winning Tickets
- Prize Distribution

---

# Integration Points

The Lottery module integrates with:

- Authentication
- User Accounts
- Ticket Service
- Wallet
- Checkout
- Draw Engine
- Prize Engine
- Notification Service
- Admin Panel
- Audit Service

The Lottery module never communicates directly with payment providers.

---

# Performance Requirements

Lottery page loading:

Target:

<300 ms

---

Current jackpot refresh:

<100 ms

---

Winner calculation:

Dependent on ticket volume.

Target:

<5 seconds for MVP.

---

Lottery history:

First page:

<500 ms

---

Verification page:

<500 ms

---

# Dependencies

Lottery depends on:

- Ticket Service
- Wallet
- Draw Engine
- Prize Engine
- Audit Service
- Notification Service

If any dependency becomes unavailable:

The draw shall not proceed.

---

# Out of Scope

The following functionality is excluded from MVP:

- Multiple simultaneous lotteries
- Regional lotteries
- Daily lotteries
- Instant-win games
- Progressive jackpot pools
- Team lotteries
- Syndicates
- Ticket trading
- Ticket resale
- Custom prize structures
- Physical prize fulfillment

---

# Future Enhancements

Future versions may include:

- Daily lotteries
- Monthly lotteries
- Multiple concurrent draws
- International lotteries
- Special event draws
- Progressive jackpots
- Charity lotteries
- Ticket subscriptions
- Auto-participation
- AI fraud detection
- Public draw livestreams
- External randomness providers
- Blockchain verification

---

# Architecture Decisions

## ADR-001

Only one active lottery exists in MVP.

---

## ADR-002

Lottery configuration becomes immutable after publication.

---

## ADR-003

Winner selection is fully automated.

---

## ADR-004

Provably Fair verification is mandatory.

---

## ADR-005

Lottery history is immutable.

---

## ADR-006

Draw execution is atomic.

---

## ADR-007

Every completed lottery generates a permanent verification record.

---

## ADR-008

Every prize payout is linked to an immutable Wallet Ledger transaction.

---

# Acceptance Criteria

The Lottery module is considered complete when:

- Administrators can create and publish lotteries.
- Only one active lottery exists in MVP.
- Users can purchase tickets while sales are open.
- Ticket sales stop automatically at the configured closing time.
- The Draw Engine starts only after all preconditions are satisfied.
- Winning tickets are selected automatically using the Provably Fair process.
- Prize amounts are calculated according to the configured distribution.
- Winners receive prizes through immutable Wallet Ledger transactions.
- Completed lotteries are archived automatically.
- Every completed draw has a public verification page.
- Lottery history remains permanently accessible.
- Every lifecycle event is audited.
- Every completed draw is reproducible and independently verifiable.

---

# End of Document

Only then may the draw begin.

---
