# 08_Draw_Engine

**Status:** Draft v1.0

---

# Purpose

The Draw Engine is responsible for executing Weekly Draws and Annual Draws within the Amazing Chance platform.

It determines winning tickets by using Random.org as the only source of randomness.

The Draw Engine must guarantee that every draw is:

- fair
- automated
- traceable
- reproducible for verification
- protected from administrative influence
- based on an immutable snapshot of eligible tickets
- permanently recorded after completion

The Draw Engine does not create tickets, process payments, manage user balances, or determine jackpot contributions.

It receives verified draw data from other platform modules and performs winner selection according to approved business rules.

---

# Business Goal

The Draw Engine exists to:

- execute lottery draws without manual influence
- guarantee equal probability for every eligible ticket
- prevent ticket manipulation after sales close
- prevent repeated execution of the same completed draw
- use an independent external randomness provider
- preserve complete evidence of every draw
- allow public and internal verification of draw results
- protect the credibility of the Amazing Chance platform
- support both Weekly Draws and Annual Draws
- isolate draw failures without stopping unrelated platform operations

---

# User Goal

Users should be able to:

- trust that winners were selected fairly
- know which tickets participated in a draw
- verify that no tickets were added after eligibility was finalized
- understand how the winning tickets were selected
- view the Random.org verification evidence
- view published winners and prize amounts
- verify completed draw results
- access historical draw records
- trust that administrators cannot influence the outcome

---

# Scope

## Included

The Draw Engine includes:

- Weekly Draw execution
- Annual Draw execution
- draw eligibility validation
- immutable eligible ticket snapshots
- deterministic ticket ordering
- ticket snapshot hashing
- Random.org integration
- random number requests
- random response verification
- winner position selection
- duplicate winner prevention
- draw result validation
- immutable draw records
- draw evidence storage
- draw status management
- draw failure handling
- retry protection
- idempotency
- concurrency protection
- audit event generation
- public verification data preparation

## Not Included

The Draw Engine does not include:

- user registration
- user authentication
- payment processing
- purchase order creation
- ticket creation
- ticket modification
- jackpot contribution calculation
- financial ledger management
- prize payment execution
- refund processing
- user notifications
- administrator financial controls
- manual winner selection
- internal random number generation

---

# Core Principles

## Independent Randomness

Random.org is the only source of randomness for MVP draw execution.

The Amazing Chance platform shall not generate, replace, modify, or manually provide the random values used to determine winners.

---

## Immutable Eligibility

Winner selection must always use an immutable snapshot of eligible tickets.

After the snapshot is finalized:

- tickets cannot be added
- tickets cannot be removed
- ticket order cannot be changed
- eligibility cannot be edited
- the snapshot cannot be regenerated for the same draw without an explicitly recorded failure recovery process

---

## Equal Probability

Every eligible ticket has an equal probability of being selected.

Winner probability must not depend on:

- user identity
- purchase time
- payment provider
- country
- device
- browser
- referral source
- previous wins
- account status, except where participation is legally prohibited
- administrator action

---

## No Administrative Influence

Administrators cannot:

- add tickets to a finalized snapshot
- remove tickets from a finalized snapshot
- reorder eligible tickets
- supply random values
- replace Random.org results
- select winners
- change winning positions
- rerun a completed draw
- modify published draw results
- modify immutable draw evidence

Administrators may only view draw status, audit information, operational alerts, and verification evidence.

---

## Deterministic Winner Selection

The same immutable ticket snapshot and the same verified Random.org response must always produce the same winners.

Winner selection logic must contain no hidden or variable inputs.

---

## Complete Auditability

Every significant draw action must create an immutable audit event.

This includes:

- draw preparation
- snapshot creation
- snapshot finalization
- snapshot hash creation
- Random.org request
- Random.org response
- response verification
- winner selection
- result validation
- draw completion
- publication
- failure
- retry
- manual operational review

---

## Failure Isolation

A draw-related failure must not stop the entire Amazing Chance platform.

When a draw operation fails, the system shall:

- stop only the affected draw operation
- preserve all existing draw data
- prevent partial completion
- create an immutable audit record
- notify authorized administrators
- place the affected draw into a recoverable operational state
- continue processing unrelated platform operations

User registration, account access, historical result viewing, and unrelated draws must remain available whenever technically possible.

---

## Atomic Completion

A draw must not be considered completed unless all required winner-selection records and verification evidence have been successfully stored.

Partial draw completion is prohibited.

---

## Historical Integrity

A completed draw is permanent.

Its:

- eligible ticket snapshot
- snapshot hash
- Random.org request
- Random.org response
- selected winners
- prize distribution reference
- timestamps
- verification evidence
  
must remain available and immutable.
  ---

  # Architecture Overview

The Draw Engine is an independent platform module responsible for executing all lottery draws.

It receives verified data from upstream modules and produces immutable draw results for downstream modules.

The Draw Engine never modifies financial records, tickets, or user accounts.

---

## Upstream Dependencies

The Draw Engine receives data from:

- Financial System
- Ticket System
- Lottery Module
- User Management
- Audit Module

The Draw Engine assumes that all received data has already been validated.

---

## Downstream Consumers

The Draw Engine provides results to:

- Prize Module
- Public Results Module
- Audit Module
- Reporting Module
- Notification Module

---

## High-Level Draw Flow

The Draw Engine performs the following sequence:

1. Verify draw eligibility.
2. Close ticket participation.
3. Create immutable ticket snapshot.
4. Calculate snapshot hash.
5. Request randomness from Random.org.
6. Verify Random.org response.
7. Select winning ticket positions.
8. Resolve winning tickets.
9. Validate results.
10. Store immutable draw evidence.
11. Publish completed draw.
12. Notify downstream modules.

Every step must either complete successfully or fail without producing partial results.

---

# Draw Types

The Amazing Chance platform supports two independent draw types.

---

## Weekly Draw

A Weekly Draw is executed once for every scheduled weekly lottery.

Eligibility:

- all confirmed tickets assigned to that Weekly Draw

Prize Pool:

- Weekly Jackpot

Winner Structure:

- 1st Place
- 2nd Place
- 3rd Place

Prize distribution is defined by the Lottery Module.

---

## Annual Draw

The Annual Draw is executed once per calendar year.

Eligibility:

Every confirmed ticket purchased during the calendar year automatically participates.

No additional purchase is required.

No separate annual ticket exists.

Prize Pool:

- Annual Jackpot

Winner structure is defined by the Lottery Module.

---

# Draw Lifecycle

Every draw follows the same lifecycle regardless of draw type.

Lifecycle:

Draft

↓

Ticket Sales Open

↓

Ticket Sales Closed

↓

Eligibility Locked

↓

Snapshot Created

↓

Snapshot Finalized

↓

Randomness Requested

↓

Randomness Verified

↓

Winner Selection

↓

Validation

↓

Completed

↓

Published

Completed draws are immutable.

---

# Draw States

## Draft

The draw exists but ticket sales have not started.

---

## Ticket Sales Open

Eligible tickets may be purchased.

---

## Ticket Sales Closed

No additional tickets may participate.

Existing confirmed tickets remain valid.

---

## Eligibility Locked

The system verifies the final list of eligible tickets.

No further changes are permitted.

---

## Snapshot Created

An immutable ordered list of eligible tickets is created.

---

## Snapshot Finalized

The snapshot hash is calculated.

This snapshot becomes the only valid source for winner selection.

---

## Randomness Requested

The platform requests random values from Random.org.

---

## Randomness Verified

The Random.org response has been successfully validated.

---

## Winner Selection

Winning ticket positions are calculated.

Winning tickets are identified.

---

## Validation

The system verifies:

- snapshot integrity
- winner uniqueness
- draw completeness
- evidence completeness

---

## Completed

The draw is permanently stored.

No further execution is permitted.

---

## Published

Results become available to users and downstream modules.

Publication does not modify draw results.

It only changes their visibility.

---

# Draw State Rules

A draw may only move forward.

Backward transitions are prohibited.

Example:

Draft

→ Ticket Sales Open

→ Ticket Sales Closed

→ Eligibility Locked

→ Snapshot Created

→ Snapshot Finalized

→ Randomness Requested

→ Randomness Verified

→ Winner Selection

→ Validation

→ Completed

→ Published

Reverse transitions are not allowed.

Completed draws cannot return to any previous state.

Published draws cannot be recalculated.

Only failed operations may be retried according to the Failure Recovery rules defined later in this document.
- audit history

must remain available and immutable.

---

# Ticket Eligibility

The Draw Engine shall determine ticket eligibility before every draw.

Only eligible tickets may participate.

Eligibility is determined automatically.

Administrators cannot manually add or remove eligible tickets.

---

## Weekly Draw Eligibility

A ticket is eligible if all of the following conditions are true:

- payment is confirmed
- ticket exists
- ticket belongs to the current Weekly Draw
- ticket has not been cancelled
- ticket was created before ticket sales closed

Tickets that do not satisfy every condition shall be excluded automatically.

---

## Annual Draw Eligibility

A ticket is eligible if:

- payment is confirmed
- ticket exists
- ticket was purchased during the current calendar year
- ticket has not been cancelled

Every confirmed ticket automatically participates.

No separate Annual Draw ticket exists.

---

# Eligibility Lock

Before winner selection begins, the Draw Engine shall lock eligibility.

After eligibility is locked:

- no new tickets may become eligible
- no eligible ticket may be removed
- ticket order cannot change
- ticket attributes cannot affect winner selection

Eligibility Lock guarantees that every participant is known before randomness is requested.

---

# Immutable Ticket Snapshot

After eligibility is locked, the Draw Engine creates an immutable ticket snapshot.

The snapshot represents the complete ordered list of participating tickets.

The snapshot is permanent.

It cannot be edited.

It cannot be regenerated for a completed draw.

---

## Snapshot Contents

Every snapshot shall contain:

- draw_id
- draw_type
- creation_timestamp
- total_ticket_count
- ordered_ticket_list
- snapshot_hash
- version

---

## Ordered Ticket List

Each ticket appears exactly once.

Each ticket occupies exactly one position.

Example:

Position 1

→ Ticket A

Position 2

→ Ticket B

Position 3

→ Ticket C

...

Position N

→ Ticket N

The ordered list becomes the only valid source for winner selection.

---

# Ticket Ordering

Ticket ordering must always be deterministic.

Given the same eligible tickets, the platform must always generate the identical order.

Ordering shall not depend on:

- database retrieval order
- server
- execution time
- administrator
- request timing

The ordering algorithm shall be identical for every draw.

---

# Snapshot Hash

Immediately after snapshot creation, the platform shall calculate a cryptographic hash.

The hash proves that the snapshot has not changed.

The hash shall be stored permanently.

---

## Hash Purpose

The snapshot hash provides evidence that:

- no ticket was added
- no ticket was removed
- ticket ordering was not modified
- eligibility remained unchanged

---

## Hash Verification

The snapshot hash may be recalculated later for verification purposes.

The recalculated hash must always match the stored value.

If hashes differ:

- winner selection shall not continue
- an immutable audit record shall be created
- the draw shall enter Review Required state
- unrelated platform operations shall continue normally

---

# Snapshot Immutability

After snapshot finalization:

The following operations are prohibited:

- add ticket
- remove ticket
- edit ticket
- reorder tickets
- replace snapshot
- regenerate snapshot for a completed draw

Only verification operations are allowed.

---

# Empty Draw Handling

If no eligible tickets exist:

The Draw Engine shall not request randomness.

Instead it shall:

- create an audit record
- mark the draw as Cancelled or No Eligible Tickets (according to Lottery Module rules)
- notify downstream modules
- preserve all draw records

The platform shall continue operating normally.

---

# Duplicate Protection

The snapshot shall never contain duplicate ticket identifiers.

Duplicate detection shall occur before snapshot finalization.

If duplicates are detected:

- snapshot creation fails
- audit event is generated
- draw enters Review Required state
- no winner selection occurs

  ---

  # Random.org Integration

The Amazing Chance platform uses Random.org as the exclusive source of randomness for all lottery draws.

No internal pseudo-random number generator shall ever be used to determine winners.

---

# Purpose

Random.org provides independently generated true random numbers.

These values are used only to determine winning ticket positions within the immutable ticket snapshot.

The Draw Engine never modifies or substitutes the received random values.

---

# Request Timing

A Random.org request shall only be created after:

- Ticket Sales Closed
- Eligibility Locked
- Snapshot Created
- Snapshot Finalized
- Snapshot Hash Stored

Randomness shall never be requested before the eligible ticket list becomes immutable.

---

# Request Parameters

The Draw Engine shall request only the amount of randomness required for the draw.

Example:

Weekly Draw

Required Winners:

- 1st Place
- 2nd Place
- 3rd Place

The request shall return three unique random positions.

Annual Draw requests follow the same principle according to the configured prize structure.

---

# Request Validation

Before sending a request, the Draw Engine shall verify:

- draw exists
- draw is not completed
- snapshot exists
- snapshot hash exists
- eligible ticket count is greater than zero

If any validation fails:

- no request shall be sent
- audit event shall be created
- draw enters Review Required state

---

# Random.org Response

After receiving the response, the Draw Engine shall verify:

- request identifier
- response integrity
- response completeness
- expected quantity of random values
- uniqueness of returned positions

Only validated responses may continue to winner selection.

---

# Invalid Response Handling

If the response cannot be validated:

- winner selection shall not begin
- draw shall not complete
- audit event shall be recorded
- draw enters Review Required state

The remainder of the platform continues operating normally.

---

# Network Failure

If Random.org cannot be reached:

The Draw Engine shall:

- record the failure
- preserve the snapshot
- preserve the snapshot hash
- preserve draw state
- notify administrators

The draw shall wait for a retry according to operational procedures.

No new snapshot shall be generated.

---

# Retry Rules

Retries are allowed only before a successful Random.org response has been accepted.

After a valid response has been stored:

- no additional requests are permitted
- no replacement responses are permitted

---

# Response Immutability

A validated Random.org response becomes part of the permanent draw evidence.

It cannot be:

- edited
- replaced
- deleted

---

# Winner Position Resolution

Random values returned by Random.org represent positions within the immutable ticket snapshot.

Example:

Snapshot:

Position 1 → Ticket A

Position 2 → Ticket B

Position 3 → Ticket C

Position 4 → Ticket D

Random.org returns:

2

4

1

Result:

1st Place → Ticket B

2nd Place → Ticket D

3rd Place → Ticket A

No additional calculations shall influence winner selection.

---

# Verification Evidence

For every completed draw the system shall permanently store:

- draw_id
- snapshot_hash
- Random.org request identifier
- request timestamp
- response timestamp
- returned random positions
- selected winning tickets
- completion timestamp

This information enables future verification of the draw.

---

# Security Principles

The Draw Engine shall never:

- generate replacement random values
- modify Random.org responses
- reorder returned positions
- manually select winners
- ignore failed validation
- continue after response verification failure

Random.org remains the single source of randomness for the entire platform.

---

# Draw Evidence Package

Every completed draw shall generate an immutable Draw Evidence Package.

The Draw Evidence Package contains all information required to independently verify the fairness and integrity of the draw.

---

## Purpose

The Draw Evidence Package provides permanent proof that:

- the draw was executed correctly
- the eligible ticket list was immutable
- the randomness originated from Random.org
- winners were selected without manipulation
- draw results have not been modified

---

## Evidence Contents

Each Draw Evidence Package shall include:

- draw_id
- draw_type
- draw_status
- draw_date
- snapshot_hash
- eligible_ticket_count
- Random.org request identifier
- Random.org request timestamp
- Random.org response timestamp
- returned random positions
- winning ticket identifiers
- prize structure
- completion timestamp
- platform version

---

## Evidence Immutability

After a draw is completed:

- the Draw Evidence Package cannot be edited
- the Draw Evidence Package cannot be replaced
- the Draw Evidence Package cannot be deleted

The package becomes a permanent part of the draw history.

---

## Verification

The Draw Evidence Package enables future verification by:

- users
- auditors
- regulators
- platform administrators

Verification must always produce the same result when using the stored evidence.

---

# Winner Selection Algorithm

The Winner Selection Algorithm determines winning tickets using the immutable ticket snapshot and the verified Random.org response.

The algorithm is deterministic.

Given the same snapshot and the same Random.org response, the platform shall always produce the identical winners.

---

# Selection Inputs

The algorithm requires:

- immutable ticket snapshot
- snapshot hash
- verified Random.org response
- configured prize structure

No additional inputs shall influence winner selection.

---

# Winner Selection Process

The Draw Engine performs the following sequence:

1. Load immutable ticket snapshot.
2. Verify snapshot hash.
3. Load verified Random.org response.
4. Read winning positions.
5. Resolve ticket identifiers.
6. Assign prize positions.
7. Validate winner uniqueness.
8. Store immutable draw results.

---

# Position Resolution

Random.org returns ticket positions.

Example:

Random.org:

15

428

91

Snapshot:

Position 15

→ Ticket T-000015

Position 428

→ Ticket T-000428

Position 91

→ Ticket T-000091

Result:

1st Place

→ Ticket T-000015

2nd Place

→ Ticket T-000428

3rd Place

→ Ticket T-000091

No additional calculations are performed.

---

# Prize Assignment

Winning positions are assigned in the exact order received from Random.org.

Example:

First returned position

→ First Prize

Second returned position

→ Second Prize

Third returned position

→ Third Prize

The platform never reorders winning positions.

---

# Winner Validation

Before completion, the Draw Engine verifies:

- every winning position exists
- every winning ticket exists
- every ticket is eligible
- every winning ticket is unique
- prize structure is complete

Only validated winners may be published.

---

# Duplicate Protection

Winning ticket identifiers shall always be unique.

If duplicate winners are detected:

- winner selection fails
- audit record is created
- draw enters Review Required state

Winner publication shall not occur.

---

# Invalid Position Handling

If Random.org returns a position outside the valid snapshot range:

- winner selection stops
- audit event is created
- draw enters Review Required state

No partial results are stored.

---

# Deterministic Behaviour

The algorithm shall always produce identical results when using:

- identical ticket snapshot
- identical snapshot hash
- identical Random.org response

Execution time, server, administrator actions, or system load shall never influence winner selection.

---

# Result Immutability

After winner selection is completed:

The following information becomes immutable:

- winning positions
- winning ticket identifiers
- prize assignments
- completion timestamp

No further modifications are permitted.

---

# Publication Readiness

Before publication, the Draw Engine verifies that:

- draw completed successfully
- evidence package exists
- audit records exist
- winner validation passed
- snapshot hash is valid

Only then may the draw be published.

---

# Public Draw Verification

The Amazing Chance platform is designed to allow independent verification of every completed draw.

Verification data shall be generated automatically during draw execution.

The Draw Engine is responsible only for generating and preserving verification data.

Presentation of verification data is handled by the Public Results Module.

---

## Purpose

Public Draw Verification increases transparency and trust by allowing anyone to verify that:

- the eligible ticket list was immutable
- Random.org was used as the only source of randomness
- winning tickets were selected correctly
- draw results were not modified after completion

---

## Verification Data

The following information shall be preserved for every completed draw:

- draw_id
- draw_type
- draw_date
- total eligible tickets
- snapshot hash
- Random.org request identifier
- Random.org request timestamp
- Random.org response timestamp
- winning positions
- winning ticket identifiers
- prize structure
- completion timestamp
- platform version

---

## Verification Process

The verification process shall confirm that:

- the stored snapshot hash is valid
- winner positions match the Random.org response
- winning tickets correspond to the immutable snapshot
- prize assignments match the configured prize structure
- no draw evidence has been modified

Verification shall always produce identical results when using the stored evidence.

---

## Public Availability

The Draw Engine shall preserve all verification data required for future public access.

Public presentation of verification data is outside the scope of the Draw Engine.

---

## Privacy

Verification data shall never expose personal user information.

Public verification may include:

- ticket identifiers
- draw identifiers
- random positions
- cryptographic hashes

Public verification shall never disclose:

- user names
- email addresses
- payment information
- personal account data
- internal platform identifiers

---

## Immutability

Verification data becomes immutable immediately after draw completion.

It cannot be:

- edited
- replaced
- deleted

Verification records remain permanently available for audit purposes.

---

# Failure Recovery

The Draw Engine shall recover safely from operational failures without compromising draw integrity.

Failure recovery shall preserve:

- ticket eligibility
- immutable ticket snapshot
- snapshot hash
- audit history
- verification evidence
- draw consistency

Recovery procedures shall never alter completed draw results.

---

# Recovery Principles

Failure recovery shall:

- preserve immutable data
- avoid duplicate winner selection
- avoid duplicate Random.org requests after a valid response has been accepted
- prevent partial draw completion
- isolate failures to the affected draw
- maintain complete audit history

Recovery shall never modify immutable records.

---

# Recoverable Failures

The following failures may be recovered:

- temporary network failure
- Random.org unavailable
- temporary infrastructure outage
- server restart
- database connection interruption
- notification delivery failure

Recovery resumes from the last successfully completed draw state.

---

# Non-Recoverable Failures

The following conditions require operational review:

- invalid snapshot hash
- corrupted snapshot
- duplicate ticket identifiers
- invalid Random.org response
- inconsistent winner validation
- missing immutable evidence

The Draw Engine shall enter the Review Required state.

Winner publication shall not occur.

---

# Review Required State

Review Required is an operational state.

It indicates that the draw requires investigation before continuing.

The platform shall:

- preserve all evidence
- preserve all audit records
- prevent winner publication
- prevent draw completion
- continue unrelated platform operations

Administrators may review the draw but cannot modify immutable data.

---

# Recovery Validation

Before recovery resumes, the Draw Engine shall verify:

- snapshot integrity
- snapshot hash
- draw state
- audit completeness
- evidence completeness

Only validated recovery may continue.

---

# Idempotent Recovery

Recovery operations shall be idempotent.

Repeated execution of the same recovery procedure shall always produce the same system state.

Recovery shall never create:

- duplicate winners
- duplicate evidence
- duplicate audit events
- duplicate completed draws

---

# Recovery Audit

Every recovery attempt shall generate immutable audit records.

Audit information shall include:

- recovery timestamp
- recovery reason
- previous draw state
- new draw state
- recovery result

Recovery history shall remain permanently available.

---

# Functional Requirements

## FR-001 — Draw Creation

The system shall create a draw according to the configured lottery schedule.

Every draw shall have:

- unique draw identifier
- draw type
- scheduled sales opening time
- scheduled sales closing time
- scheduled draw execution time
- prize structure
- initial status
- creation timestamp

---

## FR-002 — Weekly Draw Eligibility

The Draw Engine shall include every confirmed ticket assigned to the relevant Weekly Draw.

A ticket shall appear in the Weekly Draw snapshot exactly once.

---

## FR-003 — Annual Draw Eligibility

The Draw Engine shall include every confirmed ticket purchased during the relevant calendar year.

Participation in the Annual Draw shall be automatic.

No separate Annual Draw ticket shall be created or purchased.

---

## FR-004 — Ticket Sales Closing

The Draw Engine shall not finalize eligibility before ticket sales are closed.

After the sales closing deadline:

- new purchases shall not be assigned to the closed draw
- late payment confirmations shall be handled according to Ticket System rules
- existing confirmed tickets shall remain eligible
- administrators shall not extend participation manually

---

## FR-005 — Eligibility Lock

The system shall lock the final eligibility set before snapshot creation.

After eligibility is locked, the set of participating tickets shall not change.

---

## FR-006 — Snapshot Creation

The system shall create one ordered immutable ticket snapshot for every draw.

The snapshot shall contain every eligible ticket exactly once.

---

## FR-007 — Deterministic Ordering

The system shall use one documented deterministic ordering algorithm for snapshot creation.

The same eligible ticket set shall always produce the same ordered snapshot.

---

## FR-008 — Snapshot Hashing

The system shall calculate a cryptographic hash immediately after snapshot creation.

The hash shall be generated from a canonical representation of the complete ordered snapshot.

---

## FR-009 — Snapshot Finalization

A snapshot shall become final only after:

- ticket count validation
- duplicate detection
- deterministic ordering validation
- canonical serialization
- successful hash generation
- immutable storage

---

## FR-010 — Random.org Request

The Draw Engine shall request random winner positions only after the snapshot has been finalized.

The Random.org request range shall match the valid snapshot position range.

---

## FR-011 — Unique Winner Positions

The Draw Engine shall request the required number of unique winner positions.

The number of requested positions shall match the configured number of prizes.

---

## FR-012 — Random.org Verification

The system shall verify the authenticity, integrity, completeness, and expected parameters of the Random.org response before winner selection.

---

## FR-013 — Winner Resolution

The system shall resolve each returned position directly against the immutable snapshot.

The first returned position shall correspond to the first prize, the second position to the second prize, and so on.

---

## FR-014 — Winner Uniqueness

Every prize position in a draw shall be assigned to a unique ticket.

Duplicate winning tickets within the same draw are prohibited.

---

## FR-015 — Prize Structure Validation

The Draw Engine shall verify that the configured prize structure is complete before executing winner selection.

For the Weekly Draw, the approved distribution is:

- First Place — 50% of the Weekly Jackpot
- Second Place — 30% of the Weekly Jackpot
- Third Place — 20% of the Weekly Jackpot

The Draw Engine shall use prize values supplied by the authorized financial or lottery module and shall not calculate jackpot contributions independently.

---

## FR-016 — Result Validation

Before completion, the system shall validate:

- snapshot integrity
- snapshot hash
- Random.org evidence
- winner positions
- winner ticket identifiers
- winner uniqueness
- prize assignment
- evidence completeness
- audit completeness

---

## FR-017 — Atomic Draw Completion

The draw shall be marked as Completed only when all required result records, verification records, and audit records have been stored successfully.

Partial completion is prohibited.

---

## FR-018 — Draw Evidence Package

The system shall generate one immutable Draw Evidence Package for every completed draw.

The package shall contain sufficient information to reproduce and verify the winner-selection result.

---

## FR-019 — Draw Publication

Only a successfully completed draw may be published.

Publication shall not modify:

- winners
- prize assignments
- snapshot
- snapshot hash
- Random.org evidence
- completion timestamp

---

## FR-020 — Completed Draw Protection

A completed draw shall not be executed again.

Repeated execution requests shall return an idempotent response and shall not create additional winners or evidence.

---

## FR-021 — Public Verification Data

The system shall prepare privacy-safe verification data for the Public Results Module.

The Draw Engine shall not expose personal user information.

---

## FR-022 — Audit Trail

Every material draw operation shall create an immutable audit event.

The audit trail shall include successful actions, rejected actions, failures, retries, recovery attempts, and state changes.

---

## FR-023 — Failure Isolation

A non-critical failure affecting one draw shall stop only the affected draw operation.

Examples include:

- temporary Random.org unavailability
- temporary network interruption
- notification failure
- temporary downstream service failure

Unrelated platform operations may continue when system integrity remains guaranteed.

---

## FR-024 — Critical Failure Escalation

A failure that creates uncertainty regarding platform integrity shall activate Maintenance Mode.

Examples include:

- suspected system compromise
- corrupted immutable records
- invalid financial ledger integrity
- invalid ticket integrity
- database corruption
- unexplained snapshot hash mismatch
- inability to verify draw evidence
- unauthorized administrative access
- confirmed or suspected security breach

---

## FR-025 — Maintenance Mode

During Maintenance Mode, the platform shall disable all operations that may change financial, ticket, user, or draw data.

At minimum, the following shall be disabled:

- registration
- authentication that creates or updates session records, where required for security
- ticket purchases
- payment confirmation processing
- ticket generation
- draw execution
- prize payment execution
- administrative mutations

Public maintenance information may remain available through a separate static or isolated service.

---

## FR-026 — Maintenance Notification

When Maintenance Mode is activated, users shall receive a public notice explaining that the platform is temporarily unavailable because of a technical issue.

After service restoration, registered users shall be notified through:

- email
- official Telegram channel

Notification delivery failure shall not prevent safe platform recovery.

---

## FR-027 — Maintenance Recovery

The platform shall exit Maintenance Mode only after all required integrity checks have passed.

Recovery shall require:

- system integrity verification
- database consistency validation
- immutable record validation
- ticket integrity validation
- financial integrity validation
- draw evidence validation
- security review
- recorded authorization to restore operations

---

## FR-028 — Retry Protection

Retries shall be allowed only where they cannot change an already accepted result.

After a valid Random.org response has been accepted, the system shall not request replacement randomness for the same draw.

---

## FR-029 — Concurrency Protection

The Draw Engine shall prevent more than one execution process from controlling the same draw at the same time.

Only one execution lock may exist for a draw.

---

## FR-030 — System Restart Recovery

After a server restart or infrastructure interruption, the Draw Engine shall resume from the last successfully committed state.

It shall not repeat completed operations.

---

## FR-031 — Historical Availability

Completed draw records and verification evidence shall remain permanently available according to platform retention rules.

---

## FR-032 — Administrative Read Access

Authorized administrators may view:

- draw state
- operational errors
- snapshot metadata
- Random.org evidence
- winners
- audit records
- recovery status

Administrators shall not be able to modify immutable draw data.

---

## FR-033 — No Manual Winner Selection

The system shall not provide any interface, API, database operation, or administrative workflow for manual winner selection.

---

## FR-034 — No Internal Randomness

Internal random generators may be used for testing only in isolated non-production environments.

They shall never be available to production winner-selection logic.

---

## FR-035 — Environment Separation

Production draw execution shall be isolated from:

- development environments
- testing environments
- staging data
- local administrator tools

Test tickets or test randomness shall never participate in a production draw.

---

# Business Rules

## BR-001

Every draw shall have a unique identifier.

---

## BR-002

Every completed payment shall create exactly one eligible ticket.

---

## BR-003

Every eligible ticket shall participate in exactly one Weekly Draw.

---

## BR-004

Every confirmed ticket purchased during the calendar year automatically participates in the Annual Draw.

---

## BR-005

No separate Annual Draw ticket shall exist.

---

## BR-006

Ticket eligibility shall be determined automatically.

Manual eligibility changes are prohibited.

---

## BR-007

Eligibility shall be locked before winner selection begins.

---

## BR-008

Only eligible tickets may appear in the immutable ticket snapshot.

---

## BR-009

Each eligible ticket shall appear exactly once in the snapshot.

---

## BR-010

The ticket snapshot shall become immutable immediately after finalization.

---

## BR-011

The snapshot hash shall always represent the exact immutable snapshot.

---

## BR-012

Random.org shall be the exclusive production source of randomness.

---

## BR-013

Winner selection shall use only:

- immutable snapshot
- verified Random.org response

No additional information may influence the result.

---

## BR-014

Winning positions shall be assigned in the exact order returned by Random.org.

---

## BR-015

Each prize position shall be assigned to one unique ticket.

---

## BR-016

Completed draws are immutable.

---

## BR-017

Published draws are immutable.

---

## BR-018

Every completed draw shall generate one Draw Evidence Package.

---

## BR-019

Every completed draw shall generate immutable audit records.

---

## BR-020

The Draw Engine shall never calculate jackpot contributions.

Financial calculations belong exclusively to the Financial System.

---

## BR-021

The Draw Engine shall never modify tickets.

---

## BR-022

The Draw Engine shall never modify financial records.

---

## BR-023

Administrators shall never influence winner selection.

---

## BR-024

The Draw Engine shall never execute a completed draw again.

---

## BR-025

Maintenance Mode shall always take priority over draw execution.

If Maintenance Mode is active, no draw execution may begin.

---

# System Invariants

## INV-001

Only confirmed tickets may participate in any draw.

---

## INV-002

Every eligible ticket appears exactly once in the immutable snapshot.

---

## INV-003

The immutable snapshot never changes after finalization.

---

## INV-004

The stored snapshot hash always represents the immutable snapshot.

---

## INV-005

Random.org is the only production source of randomness.

---

## INV-006

The same snapshot and the same Random.org response always produce identical winners.

---

## INV-007

Completed draws are immutable.

---

## INV-008

Published results are immutable.

---

## INV-009

Every completed draw has exactly one Draw Evidence Package.

---

## INV-010

Every completed draw has a complete immutable audit history.

---

## INV-011

Financial records shall never be modified by the Draw Engine.

---

## INV-012

Ticket records shall never be modified by the Draw Engine.

---

## INV-013

Administrators shall never influence winner selection.

---

## INV-014

Platform integrity always has higher priority than platform availability.

If integrity cannot be guaranteed, Maintenance Mode shall be activated.

---

# Security Requirements

## SEC-001

Only authorized system services may execute draw operations.

---

## SEC-002

Winner selection shall be fully automated.

---

## SEC-003

Administrative interfaces shall not provide winner selection functionality.

---

## SEC-004

Administrative interfaces shall not provide Random.org override functionality.

---

## SEC-005

Every draw operation shall generate immutable audit records.

---

## SEC-006

Snapshot hashes shall be protected from modification.

---

## SEC-007

Draw Evidence Packages shall be immutable.

---

## SEC-008

Production draw execution shall be isolated from development and testing environments.

---

## SEC-009

Every critical integrity failure shall activate Maintenance Mode.

---

## SEC-010

Every Maintenance Mode activation shall generate an immutable audit record.

---

## SEC-011

Only successful integrity verification may deactivate Maintenance Mode.

---

## SEC-012

No user, administrator or external service may bypass immutable validation rules.

---

## SEC-013

Every security-sensitive action shall be timestamped and permanently recorded.

---

## SEC-014

The Draw Engine shall reject every operation that attempts to modify completed draw evidence.

---

## SEC-015

Integrity verification shall always be completed before restoring platform operations after Maintenance Mode.

---

# Validation Rules

## VAL-001

A draw shall exist before execution begins.

---

## VAL-002

The draw shall not already be completed.

---

## VAL-003

The draw shall not already be published.

---

## VAL-004

Ticket sales shall be closed before eligibility is locked.

---

## VAL-005

Every eligible ticket shall have a confirmed payment.

---

## VAL-006

The immutable snapshot shall contain no duplicate ticket identifiers.

---

## VAL-007

The snapshot hash shall match the immutable snapshot.

---

## VAL-008

The Random.org response shall pass integrity validation.

---

## VAL-009

The number of returned winner positions shall match the configured prize count.

---

## VAL-010

Every returned winner position shall exist within the snapshot range.

---

## VAL-011

Every winning ticket shall exist.

---

## VAL-012

Winning tickets shall be unique.

---

## VAL-013

The Draw Evidence Package shall be complete.

---

## VAL-014

Audit records shall be complete before draw completion.

---

## VAL-015

Platform integrity shall be verified before exiting Maintenance Mode.

---

# Error States

## ERR-001

Draw Not Found

---

## ERR-002

Draw Already Completed

---

## ERR-003

Draw Already Published

---

## ERR-004

Eligibility Validation Failed

---

## ERR-005

Snapshot Creation Failed

---

## ERR-006

Snapshot Hash Verification Failed

---

## ERR-007

Random.org Request Failed

---

## ERR-008

Random.org Response Validation Failed

---

## ERR-009

Winner Validation Failed

---

## ERR-010

Duplicate Winner Detected

---

## ERR-011

Invalid Winner Position

---

## ERR-012

Evidence Package Generation Failed

---

## ERR-013

Audit Failure

---

## ERR-014

Integrity Verification Failed

---

## ERR-015

Maintenance Mode Active

---

# Data Model

## Draw

Fields:

- draw_id
- draw_type
- status
- scheduled_open_at
- scheduled_close_at
- scheduled_draw_at
- completed_at
- published_at
- created_at

---

## Ticket Snapshot

Fields:

- snapshot_id
- draw_id
- ticket_count
- snapshot_hash
- created_at
- version

---

## Snapshot Ticket

Fields:

- snapshot_id
- position
- ticket_id

---

## Random Response

Fields:

- random_response_id
- draw_id
- request_identifier
- request_timestamp
- response_timestamp
- winner_positions
- verification_status

---

## Winner

Fields:

- winner_id
- draw_id
- prize_position
- ticket_id
- prize_amount
- created_at

---

## Draw Evidence Package

Fields:

- evidence_id
- draw_id
- snapshot_hash
- ticket_count
- random_request_identifier
- winner_positions
- winner_ticket_ids
- generated_at
- platform_version

---

# Integration Points

The Draw Engine integrates with:

- Financial System
- Ticket System
- Lottery Module
- Prize Module
- Audit Module
- Notification Module
- Reporting Module
- Public Results Module

The Draw Engine shall not directly modify external module data.

---

# Performance Requirements

- Draw execution shall be atomic.
- Snapshot creation shall scale to the supported ticket volume.
- Winner selection shall be deterministic.
- Hash generation shall complete before Random.org requests.
- Recovery shall resume without repeating completed operations.

---

# Dependencies

Required modules:

- Financial System
- Ticket System
- Lottery Module
- Audit Module
- Random.org Integration

Required before:

- Prize Distribution
- Public Results
- Reporting

---

# Out of Scope

The following features are excluded from MVP:

- Multiple randomness providers
- Blockchain verification
- Public verification API
- Live draw streaming
- Manual draw execution
- Manual winner selection
- AI-assisted fraud detection
- Multiple annual prize pools

---

# Future Enhancements

Possible future improvements include:

- Additional certified randomness providers
- Public verification portal
- Public verification API
- Blockchain evidence anchoring
- Digital evidence signatures
- Automated regulator reports
- Live draw broadcasting

---

# Acceptance Criteria

The Draw Engine shall be considered complete when:

- Weekly Draws execute successfully.
- Annual Draws execute successfully.
- Every confirmed ticket participates correctly.
- Every draw uses an immutable ticket snapshot.
- Snapshot hashes are generated and verified.
- Random.org is the exclusive production randomness source.
- Winners are selected deterministically.
- Draw Evidence Packages are generated.
- Completed draws are immutable.
- Audit history is complete.
- Administrators cannot influence draw results.
- Maintenance Mode protects platform integrity.
- Every completed draw is reproducible for independent verification.

---

# Architecture Decisions

## ADR-001

Random.org is the exclusive production randomness provider.

---

## ADR-002

Every draw uses one immutable ticket snapshot.

---

## ADR-003

Winner selection is deterministic.

---

## ADR-004

Draw Evidence Packages are immutable.

---

## ADR-005

Completed draws cannot be executed again.

---

## ADR-006

Administrators cannot influence winner selection.

---

## ADR-007

Platform integrity has higher priority than platform availability.

---

## ADR-008

Critical integrity failures activate Maintenance Mode.

---

## ADR-009

Maintenance Mode may only be deactivated after successful integrity verification.

---

## ADR-010

The Draw Engine is responsible only for draw execution and draw integrity.

Financial processing belongs exclusively to the Financial System.

---

