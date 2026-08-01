# Amazing Chance — Product Map

**Document Version:** 2.1  
**Status:** Approved  
**Authoritative business model:** `docs/01-PRODUCT.md`  
**Detailed business rules:** `docs/05_Business_Rules.md`

---

## 1. Purpose

This document maps the main product areas and user-facing flows of Amazing Chance.

It does not redefine:

- financial allocation rules;
- entity state machines;
- payment-provider requirements;
- draw-integrity rules;
- database or API design.

Those rules remain authoritative in the related product, business, architecture, and engineering documents.

---

## 2. Approved MVP Model

Amazing Chance uses direct payment for each ticket purchase.

The MVP does not include:

- a customer wallet;
- customer deposit balances;
- top-ups;
- withdrawals from an internal balance;
- user-to-user transfers;
- virtual credits.

Each payment is linked to one specific purchase for one specific draw.

The approved allocation of confirmed eligible ticket revenue is:

- 70% — Weekly Prize Pool;
- 20% — Company Revenue;
- 10% — Annual Prize Fund.

Only successfully paid tickets may participate in a draw.

---

## 3. Platform Map

```text
Amazing Chance
│
├── Public Experience
│   ├── Home
│   ├── Current Weekly Draw
│   ├── Draw Countdown
│   ├── Ticket Price
│   ├── How It Works
│   ├── Completed Draws
│   ├── Public Ticket Verification
│   └── Transparency and Verification
│
├── User Account
│   ├── Registration
│   ├── Email Verification
│   ├── Login
│   ├── Password Recovery
│   ├── Profile
│   ├── Security Settings
│   └── Account Status
│
├── Ticket Participation
│   ├── Select Draw
│   ├── Select Ticket Quantity
│   ├── Create Purchase
│   ├── Complete Direct Payment
│   ├── Confirm Payment
│   ├── Allocate Tickets
│   ├── View Purchase History
│   └── View and Verify Tickets
│
├── Draw System
│   ├── Weekly Draw
│   ├── Annual Draw
│   ├── Draw Lifecycle
│   ├── Sales Closure
│   ├── Ticket Snapshot
│   ├── RANDOM.ORG Evidence
│   ├── Deterministic Winner Selection
│   ├── Results Publication
│   └── Public Draw Replay
│
├── Financial Records
│   ├── Payment Records
│   ├── Allocation Rules
│   ├── Weekly Prize Pool Accounting
│   ├── Company Revenue Accounting
│   ├── Annual Prize Fund Accounting
│   ├── Ledger
│   ├── Refunds
│   ├── Prizes
│   ├── Payouts
│   └── Reconciliation
│
├── Administration
│   ├── User Operations
│   ├── Draw Operations
│   ├── Payment Monitoring
│   ├── Reconciliation
│   ├── Prize and Payout Review
│   ├── Risk and Compliance Review
│   └── Audit Review
│
└── Platform Operations
    ├── Security
    ├── Monitoring
    ├── Background Processing
    ├── Incident Management
    ├── Backups
    └── Infrastructure
```

---

## 4. Core User Journey

```text
Open Amazing Chance
        ↓
View current draw
        ↓
Register or log in
        ↓
Select number of tickets
        ↓
Create purchase
        ↓
Pay exact purchase amount through approved provider
        ↓
Wait for verified payment confirmation
        ↓
Receive allocated tickets
        ↓
View tickets in account
        ↓
Wait for draw completion
        ↓
View published results
        ↓
Independently verify draw evidence
        ↓
Follow prize process if a ticket wins
```

A failed, cancelled, expired, unverified, or unresolved payment must not create eligible tickets.

---

## 5. Public Experience

### 5.1 Home

The home page should present:

- current weekly draw;
- current eligible prize-pool amount;
- draw date and countdown;
- ticket price;
- primary ticket-purchase action;
- concise explanation of verification.

Displayed financial values must use confirmed eligible financial records.

### 5.2 How It Works

This section should explain:

1. select ticket quantity;
2. create a purchase;
3. pay the exact amount;
4. receive tickets after verified payment;
5. wait for sales closure and snapshot finalization;
6. review published RANDOM.ORG evidence;
7. reproduce winner selection.

### 5.3 Completed Draws

Users should be able to view:

- draw identifier;
- draw dates;
- finalized ticket count;
- winning public ticket identifiers;
- prize amounts;
- publication timestamp;
- verification evidence;
- algorithm version.

### 5.4 Public Ticket Verification

A public ticket search may expose:

- public ticket identifier;
- draw identifier;
- ticket status;
- eligibility status;
- issuance timestamp.

It must not expose private personal, identity, or payment information.

---

## 6. User Account

The account area includes:

- registration;
- email verification;
- login and logout;
- password recovery;
- profile;
- security settings;
- purchase history;
- ticket history;
- prize status;
- security notifications.

Identity, age, responsible-participation, and KYC controls remain dependent on the selected jurisdiction.

---

## 7. Direct Ticket Purchase

The approved purchase flow is:

```text
Select draw
    ↓
Select ticket quantity
    ↓
Create purchase in CREATED state
    ↓
Create payment session
    ↓
Purchase enters PAYMENT_PENDING
    ↓
Receive authenticated provider result
    ↓
Confirm exact amount, currency, merchant and purchase reference
    ↓
Purchase enters PAYMENT_CONFIRMED
    ↓
Reserve non-overlapping ticket range
    ↓
Create exact number of tickets
    ↓
Purchase enters COMPLETED
    ↓
Notify user
```

The payment provider has not yet been approved.

This document must not name a provider as supported until the product, legal, financial, and technical decision is formally recorded.

---

## 8. Purchase History

A user should be able to view:

- purchase identifier;
- creation date;
- selected draw;
- requested ticket quantity;
- exact amount and currency;
- payment status;
- purchase status;
- allocated public ticket identifiers;
- refund or manual-review status where applicable.

Historical state changes must remain auditable.

---

## 9. Ticket Participation

Tickets are allocated only after verified payment confirmation.

The system must guarantee:

- one ticket belongs to one purchase;
- one ticket belongs to one draw;
- ticket numbers do not overlap within a draw;
- retries do not create duplicate allocations;
- the number of created tickets equals the paid quantity;
- tickets cannot be added after snapshot finalization;
- finalized participation evidence cannot be edited.

Detailed ticket and purchase states are defined in `docs/05_Business_Rules.md`.

---

## 10. Draw Experience

The user-facing draw progression is:

```text
Scheduled
    ↓
Sales open
    ↓
Sales closed
    ↓
Eligible ticket snapshot finalized
    ↓
RANDOM.ORG evidence requested and verified
    ↓
Deterministic winner selection executed
    ↓
Results completed
    ↓
Verification evidence published
    ↓
Prizes processed
```

The exact internal state machine remains authoritative in `docs/05_Business_Rules.md` and the architecture documentation.

Administrators must not be able to:

- add eligible tickets after finalization;
- change the accepted randomness evidence;
- manually select or replace winners;
- modify completed results.

---

## 11. Transparency and Verification

Each completed draw should publish sufficient non-private evidence to verify:

- which draw was executed;
- when sales closed;
- the finalized eligible ticket set;
- the snapshot hash;
- the RANDOM.ORG request and response evidence;
- the normalized random positions;
- the winner-selection algorithm version;
- the resulting winning public ticket identifiers;
- the publication timestamp.

The same accepted inputs and algorithm version must always reproduce the same winners.

---

## 12. Prize and Payout Experience

A winning result creates a prize record.

Prize and payout processing may require:

- identity verification;
- age verification;
- sanctions screening;
- tax processing;
- manual review;
- legally required claim procedures.

The exact payout and claim rules remain open until jurisdictional and legal decisions are approved.

The product must not promise automatic payout where those rules are not yet defined.

---

## 13. Refund and Exception Experience

Refund behavior depends on the approved refund policy and payment-provider capabilities.

Current required product behavior:

- failed payment creates no tickets;
- expired payment creates no tickets;
- duplicate callbacks create no duplicate tickets;
- late payment enters reconciliation or manual review;
- a closed draw does not accept late tickets;
- a purchase is never silently moved to another draw;
- the user receives a clear status;
- any approved correction uses auditable compensating records.

This document does not define automatic refunds as a universal rule.

---

## 14. Administration

Administrative tools may support:

- user-status operations;
- draw scheduling and controlled lifecycle commands;
- payment and webhook monitoring;
- reconciliation;
- risk and compliance review;
- prize and payout review;
- audit inspection;
- incident response.

Administrative access must use explicit permissions.

Administrative tools must not permit direct editing of:

- confirmed payments;
- ledger history;
- issued tickets;
- finalized snapshots;
- accepted randomness evidence;
- winners;
- published draw results;
- immutable audit records.

---

## 15. Notifications

The platform may notify users about:

- registration and email verification;
- successful payment confirmation;
- ticket issuance;
- purchase failure, expiration, or manual review;
- draw closure;
- draw publication;
- winning ticket;
- prize or payout status;
- account-security events.

Notifications report authoritative system state and must not create or change business state.

---

## 16. MVP Scope

The MVP product map includes:

- public landing experience;
- registration and authentication;
- direct ticket purchase;
- payment confirmation;
- deterministic ticket allocation;
- user purchase and ticket history;
- weekly draw;
- annual prize-fund accounting;
- finalized ticket snapshot;
- RANDOM.ORG evidence;
- deterministic winner selection;
- public draw verification;
- prize and payout workflow;
- basic administration;
- immutable financial and audit records.

---

## 17. Out of Scope

The MVP does not include:

- customer wallet;
- stored customer balance;
- deposits for future purchases;
- user-initiated wallet withdrawals;
- user-to-user transfers;
- virtual credits or tradable tokens;
- ticket resale;
- online casino games;
- sports betting;
- poker;
- cryptocurrency exchange;
- multiple game formats;
- multiple jurisdictions at launch.

---

## 18. Open Product Decisions

The following remain unresolved until formally approved:

- operating jurisdiction;
- legal classification and licensing;
- age and identity verification;
- payment provider;
- refund policy;
- prize claim window;
- tax handling;
- annual draw rules;
- payout procedure;
- responsible-participation controls;
- fraud and chargeback model.

These items must not be represented as implemented or approved product features.

---

## 19. Related Documentation

- `docs/01-PRODUCT.md`
- `docs/05_Business_Rules.md`
- `docs/00_System_Architecture.md`
- `docs/01_ENGINEERING_PRINCIPLES.md`
- `docs/02_PLATFORM_PRINCIPLES.md`
- `docs/STANDARDS.md`
- `docs/architecture/system.md`
- `docs/modules/README.md`
- `docs/audits/REMEDIATION_PLAN.md`
