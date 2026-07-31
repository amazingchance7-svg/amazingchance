# 09 — Observability

## Structured logs

Every log entry uses structured fields, including where relevant:

- timestamp;
- level;
- service and environment;
- request ID;
- correlation ID;
- actor ID;
- operation;
- resource public ID;
- duration;
- result;
- stable error code.

Never log passwords, tokens, secrets, full webhook payloads containing sensitive data, or payment credentials.

## Metrics

Critical metrics include:

- purchase creation rate and failure rate;
- payment success, failure, and verification mismatch rate;
- webhook duplicate and signature-failure rate;
- ticket-allocation latency and retry count;
- transaction serialization failures;
- duplicate-constraint attempts;
- outbox backlog and age;
- worker retry and dead-letter counts;
- draw execution duration;
- login failures and rate-limit events;
- database pool saturation and query latency.

## Tracing

Correlation should span HTTP request, database transaction, outbox event, worker processing, and external provider calls.

Trace attributes must not contain secrets or excessive personal data.

## Alerts

High-priority alerts:

- payment confirmed without completed purchase beyond threshold;
- completed purchase with ticket-count mismatch;
- overlapping or duplicate ticket constraint attempt;
- draw execution failure;
- invalid webhook signature spike;
- database unavailability or replication lag;
- backup failure;
- outbox backlog exceeding threshold;
- privileged authentication anomalies.

## Business reconciliation dashboards

Daily controls compare:

- provider successful payments vs internal successful payments;
- completed purchases vs allocations;
- allocation range size vs ticket rows;
- eligible ticket count vs draw snapshot;
- published results vs finalized result evidence.
