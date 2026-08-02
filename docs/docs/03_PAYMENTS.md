# 03 — Payments

## Provider abstraction

Each provider adapter implements a stable internal contract for:

- creating payment sessions;
- verifying signatures;
- parsing raw events;
- retrieving authoritative payment state when necessary;
- normalizing provider status;
- initiating and reading refunds.

Provider-specific payloads do not leak into purchase-domain logic.

## Webhook sequence

1. Receive raw request bytes within a strict size limit.
2. Identify the configured provider endpoint.
3. Verify signature before trusting parsed business fields.
4. Verify timestamp or replay window where supported.
5. Parse into a strict schema.
6. Verify merchant/account identifier.
7. derive the provider event ID and payment reference.
8. begin idempotent processing.
9. load the authoritative payment and purchase.
10. compare amount and currency.
11. compare provider reference and expected account.
12. retrieve provider state through the provider API if the event is insufficient or ambiguous.
13. process the state change transactionally.
14. acknowledge only after durable commit.

## Payment data model

Recommended records:

- `Payment`: business payment aggregate.
- `PaymentAttempt`: each initialization or retry.
- `PaymentProviderEvent`: raw event metadata, digest, status, processed time.
- `PaymentStateEvent`: append-only transitions.
- `Refund`: refund aggregate.

Do not store card PAN, CVV, magnetic-track data, or equivalent sensitive authentication data.

## Amount rules

- Store money in integer minor units.
- Store explicit ISO currency.
- Calculate amount server-side.
- Compare exact minor units from provider evidence.
- Define zero-decimal and non-two-decimal currency behavior centrally.

## Event uniqueness

Use a composite uniqueness rule that includes provider identity and provider event ID. Provider names or accounts may have separate event namespaces.

## Out-of-order events

Provider events can arrive late or out of order. State transitions must be monotonic and based on provider evidence, not arrival order.

Examples:

- A late `processing` event must not downgrade a successful payment.
- A duplicate success event must return the original result.
- A dispute or chargeback uses an explicit post-payment workflow.

## Reconciliation

A scheduled reconciliation job compares internal payment state with provider reports or APIs. It creates review cases for discrepancies and does not silently rewrite critical state.

## Secret handling

Provider secrets are environment secrets with:

- least-privilege access;
- separate staging and production values;
- rotation procedures;
- no logging;
- no storage in source control;
- redaction in errors and traces.
