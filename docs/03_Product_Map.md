# Amazing Chance — Product Map

**Document Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-07-21

---

## 1. Document Purpose

This document defines the major product modules of Amazing Chance and their responsibilities.

It answers the question:

> What parts does the Amazing Chance platform consist of?

This document does not define database tables, API endpoints or detailed business rules. Those will be documented separately.

---

## 2. Platform Overview

Amazing Chance is a transparent jackpot platform built around four core capabilities:

1. Users can participate in scheduled jackpot draws.
2. Every valid ticket can be publicly verified.
3. Every draw can be independently audited and replayed.
4. Every financial and administrative action is recorded.

---

## 3. Platform Map

```text
Amazing Chance Platform
│
├── Public Experience
│   ├── Home Page
│   ├── Current Jackpot
│   ├── Draw Countdown
│   ├── How It Works
│   ├── Draw Results
│   ├── Public Ticket Search
│   └── Transparency Center
│
├── User Account
│   ├── Registration
│   ├── Authentication
│   ├── Identity and Age Verification
│   ├── Profile
│   ├── Security Settings
│   └── Responsible Participation Controls
│
├── Participation
│   ├── Ticket Purchase
│   ├── Payment Processing
│   ├── Ticket Allocation
│   ├── Purchase History
│   └── Ticket Verification
│
├── Draw System
│   ├── Weekly Draw
│   ├── Annual Draw
│   ├── Draw Lifecycle
│   ├── Ticket Set Finalization
│   ├── Randomness Provider
│   ├── Winner Selection
│   └── Prize Calculation
│
├── Financial System
│   ├── Payment Ledger
│   ├── Prize Ledger
│   ├── Jackpot Allocation
│   ├── Refunds
│   ├── Payouts
│   └── Reconciliation
│
├── Transparency and Audit
│   ├── Public Ticket Registry
│   ├── Draw Timeline
│   ├── Draw Archive
│   ├── Verification Certificate
│   ├── Cryptographic Hashes
│   ├── Draw Replay
│   └── Audit Log
│
├── User Engagement
│   ├── Notifications
│   ├── Achievements
│   ├── Reputation
│   └── Referral System
│
├── Administration
│   ├── User Management
│   ├── Draw Monitoring
│   ├── Payment Monitoring
│   ├── Payout Review
│   ├── Fraud Review
│   ├── Compliance Review
│   └── System Configuration
│
└── Platform Operations
    ├── Security
    ├── Monitoring
    ├── Incident Management
    ├── Analytics
    ├── Backups
    └── Infrastructure
4. Public Experience
4.1 Home Page

The Home Page communicates the product value immediately.

It displays:

current weekly jackpot;
current annual jackpot;
draw countdown;
ticket price;
primary participation action;
key transparency indicators.

The first screen must remain simple and focused.

4.2 Current Jackpot

The platform displays the current jackpot amount using confirmed financial data.

The displayed jackpot must never be based on unconfirmed payments.

4.3 How It Works

This section explains:

how a ticket is purchased;
how the ticket becomes public;
how the draw is finalized;
how winners are selected;
how results can be verified.
4.4 Public Draw Results

Users can view:

completed draws;
winning ticket IDs;
prize amounts;
draw timestamp;
verification certificate;
randomness provider evidence.
4.5 Public Ticket Search

A user can search for a ticket using its public ticket ID.

Public information may include:

public ticket ID;
public nickname;
draw identifier;
ticket status;
purchase confirmation timestamp.

Private personal information must never be displayed.

5. User Account
5.1 Registration and Authentication

The account system manages:

registration;
login;
email verification;
password recovery;
multi-factor authentication;
session management.
5.2 Identity and Age Verification

Identity and age verification requirements depend on the operating jurisdiction.

The system must be designed so that verification can be required before:

purchasing tickets;
withdrawing prizes;
exceeding regulatory limits.

The exact rules must not be implemented until the legal jurisdiction is selected.

5.3 Responsible Participation Controls

Depending on legal requirements, the platform may include:

purchase limits;
account cooling-off periods;
self-exclusion;
account suspension;
responsible participation information.

These controls are mandatory product considerations, not optional marketing features.

6. Participation
6.1 Ticket Purchase

The purchase process must:

create a purchase request;
send the user to an approved payment provider;
confirm the payment;
allocate tickets exactly once;
publish the public ticket records;
issue a receipt.

A payment attempt must never create tickets before confirmed payment.

6.2 Ticket Allocation

Tickets are allocated only after successful payment confirmation.

The system must guarantee:

no duplicate ticket IDs;
no missing allocated tickets;
no double allocation after repeated requests;
full traceability to the purchase.

Tickets should be allocated dynamically rather than pre-generated in massive quantities.

6.3 Purchase History

The user can view:

purchase date;
payment amount;
number of tickets;
associated draw;
payment status;
ticket IDs;
refund status.
7. Draw System
7.1 Weekly Draw

The Weekly Draw is the primary recurring draw.

Its planned prize allocation is:

70% of eligible ticket revenue to the Weekly Jackpot;
15% to the Annual Jackpot;
15% to company revenue.

The final structure remains subject to legal, tax and payment-processing validation.

7.2 Weekly Winner Distribution

The current proposed Weekly Jackpot distribution is:

first winner: 50%;
second winner: 30%;
third winner: 20%.

This is a product assumption and must be validated before launch.

7.3 Annual Draw

The Annual Draw uses funds accumulated from the annual jackpot allocation.

Its exact:

schedule;
eligibility rules;
number of winners;
prize distribution;
jurisdictional treatment

must be defined in the Business Rules document after legal review.

7.4 Draw Lifecycle

Each draw follows a controlled lifecycle:

Draft
→ Open
→ Ticket Sales Active
→ Sales Closed
→ Ticket Set Finalized
→ Hash Published
→ Randomness Requested
→ Winners Selected
→ Results Published
→ Prizes Processed
→ Archived

A draw cannot move backward to an earlier state.

7.5 Randomness Provider

The proposed external randomness provider is Random.org.

Before production launch, the platform must verify:

service availability;
commercial terms;
API limits;
audit evidence;
fallback procedures;
regulatory acceptance.

The system must not silently switch to another randomness source during a draw.

8. Financial System
8.1 Financial Ledger

Every financial event must create an immutable ledger entry.

Examples:

payment received;
payment failed;
refund created;
weekly jackpot allocation;
annual jackpot allocation;
company allocation;
prize obligation;
prize payout.

Balances must be calculated from ledger entries rather than manually edited totals.

8.2 Jackpot Allocation

Jackpot values must be based only on eligible, confirmed and reconciled payments.

Chargebacks, refunds and failed payments must be handled according to documented business rules.

8.3 Prize Payouts

Prize payouts may require:

identity verification;
sanctions screening;
anti-money-laundering checks;
tax processing;
manual review above defined limits.

No administrator should be able to change a winner or prize amount directly.

8.4 Reconciliation

The platform must reconcile:

internal purchase records;
payment-provider records;
ledger entries;
ticket allocations;
jackpot allocations;
completed payouts.

Any mismatch must generate an operational alert.

9. Transparency and Audit
9.1 Public Ticket Registry

Every valid ticket must appear in the public registry before the draw is finalized.

The registry must not reveal:

legal name;
email;
address;
payment details;
identity documents.
9.2 Draw Timeline

Each completed draw displays a chronological record of important events.

Example:

Draw opened
Ticket sales started
Ticket sales closed
Final ticket count recorded
Ticket-set hash published
Randomness requested
Randomness response received
Winners calculated
Results published
Prizes processed
Draw archived
9.3 Verification Certificate

Each completed draw receives a permanent certificate containing:

draw ID;
draw dates;
final ticket count;
ticket-set hash;
randomness request evidence;
randomness result;
winning ticket IDs;
prize distribution;
publication timestamp;
software version used for the draw.
9.4 Draw Replay

The replay tool allows an independent party to repeat the winner-selection calculation using:

the finalized ticket set;
the published randomness result;
the published selection algorithm.

The same inputs must always produce the same winners.

9.5 Audit Log

The audit log records sensitive actions performed by:

administrators;
automated services;
support agents;
compliance personnel.

Audit records must not be editable through the administration interface.

10. User Engagement
10.1 Notifications

The platform may notify users about:

successful purchases;
ticket allocation;
upcoming draw closure;
draw results;
prize status;
account-security events.

Notifications must not use false urgency or misleading claims.

10.2 Achievements and Reputation

Achievements must reward participation in the community and transparency features rather than excessive spending.

Possible achievements:

Early Supporter;
Transparency Explorer;
Verified Member;
Weekly Supporter;
Annual Supporter;
Community Member;
Lucky Winner.

Achievements must not change the probability of winning.

10.3 Referral System

The referral system is not part of the initial critical transaction flow.

It must not be launched until:

fraud controls are defined;
unit economics are validated;
legal restrictions are reviewed;
reward funding is identified.
11. Administration
11.1 Administrative Principles

Administrators may monitor and manage operations, but they must not be able to:

create winning tickets;
replace winners;
modify finalized ticket sets;
change published randomness;
delete audit evidence;
directly edit ledger balances.
11.2 Role-Based Access

Administrative permissions must be separated by role.

Possible roles:

Support;
Finance;
Compliance;
Risk;
Operations;
Security;
System Administrator.

Sensitive operations may require approval from more than one authorized person.

12. Platform Operations
12.1 Security

The platform requires:

encryption in transit and at rest;
secure authentication;
secrets management;
rate limiting;
fraud monitoring;
vulnerability management;
access logging;
incident response procedures.
12.2 Monitoring

The system must monitor:

payment failures;
ticket-allocation failures;
duplicate requests;
draw-state transitions;
randomness-provider availability;
reconciliation mismatches;
suspicious account activity;
payout failures.
12.3 Backups and Recovery

The platform requires tested backup and recovery procedures.

A backup is not considered reliable until its restoration has been successfully tested.

13. MVP Scope

The first production-ready MVP should include only:

public Home Page;
registration and login;
basic identity and age controls required by jurisdiction;
approved payment integration;
ticket purchase;
ticket allocation;
user ticket history;
Weekly Draw;
public ticket registry;
draw archive;
verification certificate;
draw replay;
financial ledger;
basic administration;
security monitoring;
audit logging.
14. Not Included in the Initial MVP

The initial MVP should not include:

complex achievement systems;
advanced referrals;
multiple game formats;
crypto payments;
internal tradable tokens;
social feeds;
ticket resale;
user-to-user transfers;
mobile applications;
multiple jurisdictions at launch.

These features may be considered only after the core model is legally validated and economically proven.

15. Critical Dependencies

The platform cannot launch until the following are resolved:

Operating jurisdiction.
Legal classification of the product.
Required licences.
Approved payment providers.
Identity and age-verification requirements.
Responsible participation requirements.
Tax treatment of ticket sales and prizes.
Randomness-provider acceptance.
Prize payout procedures.
Fraud and chargeback model.
16. Product Boundary

Amazing Chance is responsible for:

user accounts;
purchases;
ticket allocation;
draws;
financial records;
transparency;
prize processing;
audit evidence.

External providers may be responsible for:

payments;
identity verification;
sanctions screening;
email and SMS delivery;
randomness generation;
infrastructure hosting.

Amazing Chance remains responsible for validating and recording every external result used by the platform.

17. Product Success Conditions

The product is not ready for launch unless it can demonstrate:

every confirmed purchase creates the correct number of tickets;
repeated payment callbacks cannot create duplicate tickets;
finalized draws cannot be altered;
public results can be independently verified;
financial allocations reconcile exactly;
administrators cannot secretly change winners;
recovery procedures have been tested;
the legal operating model has been approved.
