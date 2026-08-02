# 08 — Asynchronous Processing and Outbox

## Rule

Business completion must not depend on email, Telegram, analytics, or another non-critical external call.

## Transactional outbox

Inside the same transaction as the business state change, insert an `OutboxEvent` containing:

- event ID;
- event type and version;
- aggregate type and ID;
- correlation ID;
- payload;
- creation time;
- processing state.

After commit, workers claim and publish events.

## Worker claiming

Use a safe claiming pattern such as `FOR UPDATE SKIP LOCKED`, a queue with durable acknowledgement, or an equivalent proven mechanism.

Workers are idempotent. A message can be delivered more than once.

## Event consumers

Consumers store an inbox/processed-event record where duplicate side effects are harmful.

Examples:

- notification provider send;
- analytics forwarding;
- report generation;
- partner callback.

## Retry and dead-letter policy

- bounded exponential retry;
- classify transient and permanent errors;
- dead-letter or review state after the maximum attempts;
- alert on growing backlog;
- preserve the original event and failure reason.

## Event evolution

Every event has a schema version. Consumers tolerate additive changes and use explicit migration or adapters for breaking changes.

## Scheduling

Time-sensitive jobs such as draw close and execution are persisted as domain state, not only held in process memory. A worker repeatedly finds due work using idempotent transitions.
