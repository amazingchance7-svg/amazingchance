# Amazing Chance Core Architecture

## 1. Architecture Goal

Amazing Chance must be designed as a secure, scalable and verifiable digital jackpot platform.

The architecture must support:

- millions of tickets per weekly draw;
- thousands of simultaneous purchases;
- unique ticket identifiers without duplicates;
- real-time jackpot updates;
- public ticket verification;
- immutable draw archives;
- secure wallet and payment processing;
- automated weekly and annual draws;
- complete audit logs;
- protection against fraud and unauthorized changes.

---

## 2. Core Architecture Principles

### 2.1 Financial accuracy

Money must never be calculated using floating-point numbers.

All financial values must be stored as integer cents.

Example:

$1.00 = 100 cents

Ticket distribution:

- 70 cents — Weekly Jackpot;
- 15 cents — Annual Jackpot;
- 15 cents — Platform Revenue.

---

### 2.2 Database as the source of truth

The main relational database is the authoritative source for:

- users;
- draws;
- tickets;
- wallet balances;
- transactions;
- winners;
- payouts;
- audit events.

Cached or real-time data must never replace the authoritative database.

---

### 2.3 Immutable financial ledger

Wallet balances must not be changed directly.

Every deposit, ticket purchase, prize, refund and withdrawal must create a permanent ledger entry.

The user balance is calculated from ledger transactions.

Existing ledger records cannot be edited or deleted.

Corrections must be made with a new compensating transaction.

---

### 2.4 Idempotency

Every important operation must accept an idempotency key.

This prevents duplicate:

- deposits;
- ticket purchases;
- ticket generation;
- payouts;
- withdrawals;
- notifications.

Repeating the same request must not charge the user or generate tickets twice.

---

### 2.5 Complete auditability

Every sensitive action must create an audit record containing:

- actor;
- action;
- date and time;
- affected entity;
- previous state;
- new state;
- IP address;
- request identifier.

Administrators must not be able to silently modify tickets, draws, balances or winners.

---

## 3. Main System Components

### 3.1 Web Application

Responsible for:

- public website;
- registration and login;
- user dashboard;
- ticket purchase;
- wallet;
- ticket verification;
- transparency center;
- draw archive;
- notifications.

The interface must be responsive and mobile-first.

---

### 3.2 Application API

Responsible for all business operations:

- authentication;
- users;
- wallets;
- payments;
- ticket purchases;
- draws;
- verification;
- winners;
- notifications;
- administration.

The frontend must never connect directly to the database.

---

### 3.3 Authentication Service

Responsible for:

- registration;
- email verification;
- login;
- password reset;
- session management;
- two-factor authentication;
- account lockout;
- suspicious login detection.

---

### 3.4 Wallet and Ledger Service

Responsible for:

- user balances;
- deposits;
- ticket purchase deductions;
- prize credits;
- withdrawals;
- refunds;
- transaction history;
- reconciliation.

Every wallet operation must run inside a database transaction.

---

### 3.5 Payment Service

Responsible for:

- creating payment sessions;
- processing payment provider webhooks;
- payment confirmation;
- failed payments;
- refunds;
- reconciliation;
- fraud checks.

Tickets may only be created after payment or wallet deduction is confirmed.

---

### 3.6 Ticket Service

Responsible for:

- allocating unique ticket positions;
- generating public ticket identifiers;
- connecting tickets to users and draws;
- processing bulk purchases;
- publishing tickets in the public ticket list;
- providing ticket search and verification.

---

### 3.7 Draw Service

Responsible for:

- creating weekly draws;
- creating the annual draw;
- opening and closing ticket sales;
- locking the final ticket list;
- generating the final ticket snapshot;
- creating a SHA-256 hash;
- requesting random positions;
- identifying winners;
- calculating prizes;
- creating the verification certificate;
- opening the next draw.

---

### 3.8 Randomness Adapter

Responsible for communication with Random.org.

It must:

- request three unique integers;
- use the range from 1 to the final ticket count;
- save the complete request and response;
- verify the provider signature when available;
- prevent manual replacement of results;
- support safe retries without creating a second draw.

Random.org credentials must only exist on the server.

---

### 3.9 Notification Service

Responsible for:

- email notifications;
- in-app notifications;
- browser push notifications;
- purchase confirmations;
- draw reminders;
- draw start notifications;
- winner announcements;
- prize notifications;
- withdrawal and security alerts.

All registered users may receive the final results containing:

- draw number;
- winner nicknames according to privacy settings;
- winning ticket identifiers;
- prize amounts;
- link to verify the draw.

---

### 3.10 Transparency Service

Responsible for public access to:

- current ticket list;
- archived ticket lists;
- ticket verification;
- final ticket count;
- jackpot calculation;
- ticket-list hash;
- Random.org request and response;
- winning positions;
- winning tickets;
- verification certificate;
- draw replay;
- payout status.

---

### 3.11 Administration Panel

Responsible for:

- users;
- support;
- payments;
- withdrawals;
- risk alerts;
- notifications;
- content;
- system health;
- reports.

Administrators must not be able to:

- create winning tickets manually;
- change locked ticket lists;
- replace random results;
- directly edit wallet balances;
- delete audit records;
- alter completed draw certificates.

---

## 4. Ticket Architecture

### 4.1 Ticket position

Each draw has its own sequential ticket positions:

1, 2, 3, 4, 5 ... N

The position is unique only inside its draw.

A database uniqueness rule must exist for:

(draw_id, position)

---

### 4.2 Public ticket identifier

Each ticket also receives a public identifier.

Example:

AC-2027-W31-00492381

Format:

- AC — Amazing Chance;
- 2027 — year;
- W31 — weekly draw number;
- 00492381 — ticket position.

The database must also enforce global uniqueness for the public identifier.

---

### 4.3 Ticket allocation

Tickets are generated only after a successful purchase.

For a bulk purchase, the system reserves a continuous range of ticket positions inside one database transaction.

Example:

User buys 100 tickets.

The system reserves positions:

500001–500100

This is faster and safer than generating ticket numbers independently.

---

### 4.4 Duplicate prevention

Duplicate tickets are prevented by:

- atomic range allocation;
- database transactions;
- unique database constraints;
- idempotency keys;
- one purchase record for each ticket batch;
- retry-safe processing.

Application logic alone is not sufficient.

The database must reject duplicates even if several servers process purchases simultaneously.

---

## 5. Ticket Purchase Transaction

A ticket purchase must happen as one atomic operation:

1. Validate the user and draw status.
2. Validate age, country and account restrictions.
3. Validate available wallet balance.
4. Lock the required wallet and draw allocation records.
5. Create the purchase record.
6. Deduct the total amount from the wallet ledger.
7. Allocate the ticket position range.
8. Create all ticket records.
9. Allocate 70% to the weekly jackpot.
10. Allocate 15% to the annual jackpot.
11. Allocate 15% to platform revenue.
12. Commit the transaction.
13. Publish real-time updates after the commit.
14. Send the purchase notification.

If any database step fails, the entire transaction must roll back.

The user must never lose funds without receiving tickets.

---

## 6. Draw Lifecycle

Every weekly draw passes through these states:

1. Scheduled
2. Open
3. Closing
4. Locked
5. Randomness Requested
6. Winners Calculated
7. Published
8. Payout Processing
9. Completed
10. Archived

State changes must be controlled by the system.

Completed draws cannot return to an earlier state.

---

## 7. Draw Closing Process

At the configured closing time:

1. Stop new purchases.
2. Wait for already-confirmed transactions to finish.
3. Count all valid tickets.
4. Create the ordered final ticket snapshot.
5. Generate its SHA-256 hash.
6. Store the snapshot in immutable storage.
7. Publish:
   - final ticket count;
   - closing time;
   - ticket-list hash.
8. Request three unique random positions.
9. Map the positions to tickets.
10. Calculate prizes:
    - first winner — 50%;
    - second winner — 30%;
    - third winner — 20%.
11. Credit winner wallets.
12. Create the draw certificate.
13. Publish the results.
14. Notify registered users.
15. Open the next weekly draw.

The annual jackpot balance continues accumulating until the annual draw.

---

## 8. Scalability

The system must be designed so that additional application servers can be added without changing business logic.

Recommended principles:

- stateless API servers;
- load balancing;
- background job workers;
- database connection pooling;
- caching only for derived public data;
- read replicas for public ticket searches;
- object storage for archived snapshots and certificates;
- real-time events through a dedicated event channel;
- pagination and indexed search for ticket lists;
- monitoring and automatic alerts.

The first version may use a modular monolith.

Microservices should only be introduced when real scale or team structure requires them.

---

## 9. Security

Minimum security requirements:

- encrypted traffic;
- secure password hashing;
- email verification;
- optional two-factor authentication;
- rate limiting;
- bot protection;
- secure session management;
- role-based access control;
- withdrawal verification;
- payment webhook signature validation;
- encryption of sensitive data;
- secrets stored outside the code repository;
- database backups;
- disaster recovery plan;
- dependency scanning;
- security monitoring;
- suspicious activity detection;
- immutable audit logs.

---

## 10. Fraud Prevention

The risk system must detect:

- multiple accounts controlled by one person;
- stolen payment methods;
- repeated failed deposits;
- automated account creation;
- bonus or referral abuse;
- abnormal ticket-buying patterns;
- account takeover;
- suspicious withdrawals;
- administrator misuse;
- attempts to purchase after sales close.

High-risk actions may require identity verification and manual review.

---

## 11. Privacy

Public ticket lists must not expose:

- email addresses;
- real names without permission;
- payment information;
- wallet balances;
- IP addresses;
- private account identifiers.

Public information may include:

- public nickname or masked nickname;
- public ticket identifier;
- draw number;
- purchase time with an appropriate privacy level;
- ticket status;
- winning status;
- prize amount.

---

## 12. Reliability Rules

The system must fail safely.

If Random.org is temporarily unavailable:

- the draw remains locked;
- no internal random fallback is used;
- the ticket list remains unchanged;
- the system retries according to a documented policy;
- users receive a transparent status update.

If a payment provider is unavailable:

- no unconfirmed tickets are generated;
- pending operations remain reconcilable;
- users are not charged twice.

---

## 13. Initial Technical Direction

Recommended initial structure:

- modular monolith;
- relational database;
- background job queue;
- real-time update channel;
- object storage;
- external email provider;
- external payment providers;
- Random.org integration;
- centralized monitoring and logs.

The final technologies will be selected after the database model and infrastructure requirements are approved.

---

## 14. Non-Negotiable Rules

- No duplicate tickets.
- No direct wallet balance editing.
- No ticket generation before confirmed payment.
- No draw without a locked final ticket list.
- No manual winner selection.
- No hidden changes to completed draws.
- No deletion of financial or audit history.
- No secret fallback randomizer.
- No exposure of private user information.
- No administrator account with unlimited unlogged power.
