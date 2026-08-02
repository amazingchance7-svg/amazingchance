# 00 — System Context

## Scope

Amazing Chance sells entries for scheduled draws. The platform records purchases, verifies payment events, allocates ticket numbers, executes draws, publishes verification data, and supports refunds and administration.

## Primary actors

- Visitor: views public draws and verification information.
- Registered user: buys tickets and views purchases.
- Administrator: manages configured operational workflows.
- Finance operator: reviews payments and refunds within permissions.
- Compliance operator: handles jurisdictional or identity checks.
- Support agent: reads permitted customer and transaction data.
- Payment provider: sends signed asynchronous events.
- Background worker: processes durable outbox jobs.
- Auditor: reviews immutable records and draw evidence.

## External systems

- Payment processors.
- Email and Telegram delivery providers.
- Object storage for reports and published artifacts.
- Monitoring and error-tracking platforms.
- Public randomness sources, where used by the final fairness protocol.

## Trust boundaries

All data crossing HTTP, bot, partner, webhook, administration, worker, and third-party boundaries is untrusted until verified.

Untrusted examples:

- identifiers;
- ticket counts;
- prices and totals;
- currency;
- draw state;
- payment success claims;
- webhook timestamps and event IDs;
- administrator input;
- file uploads;
- request headers.

## System-of-record rule

PostgreSQL is authoritative for:

- users and security state;
- purchases;
- payments;
- ticket allocations;
- tickets;
- draw state and result;
- audit logs;
- idempotency records;
- outbox events.

Redis may accelerate reads, rate limits, locks, and queues, but loss of Redis must not corrupt financial or ticket state.

## Non-goals for the initial release

- Microservices for every module.
- Multi-region active-active writes.
- Cryptocurrency custody.
- Direct storage of card details.
- Manual database editing as an operational workflow.

## Jurisdictional gate

Before public launch in any country, legal review must define whether the product is classified as a lottery, prize competition, sweepstakes, gambling service, or another regulated activity. Architecture does not replace licensing, consumer protection, tax, AML, sanctions, age, or payment-network requirements.
