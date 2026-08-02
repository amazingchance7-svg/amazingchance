# 10 — Testing Strategy

## Test pyramid

- Unit tests for pure policies and calculations.
- Integration tests against real PostgreSQL for repository and transaction behavior.
- API tests for validation, authentication, and error contracts.
- End-to-end tests for the core purchase flow.
- Concurrency tests for race-sensitive invariants.
- Security and abuse tests.

Mocks are not sufficient for PostgreSQL locking, constraints, raw SQL, or transaction isolation.

## Mandatory unit tests

- purchase transition matrix;
- amount calculation;
- ticket-range size validation;
- idempotency request hashing;
- winner-selection algorithm;
- canonical serialization and digest;
- permission policies.

## Mandatory integration tests

- purchase creation idempotency;
- verified payment completion;
- invalid amount and currency rejection;
- ticket range allocation;
- ticket insertion count;
- transaction rollback after injected failure;
- duplicate webhook event;
- out-of-order webhook state;
- refund eligibility changes;
- draw finalization uniqueness.

## Concurrency tests

Run many parallel operations and assert database invariants.

Required scenarios:

1. Many purchases allocate tickets in the same draw.
2. Many workers process one purchase.
3. Duplicate success webhooks arrive simultaneously.
4. First allocation occurs concurrently when no sequence row exists.
5. Draw closes while eligible purchases complete.
6. Two workers execute the same draw.

Assertions:

- no overlapping ranges;
- no duplicate ticket numbers;
- exactly one allocation per purchase;
- exact ticket counts;
- no partial committed state;
- one final draw result.

## Fault injection

Inject failures after each transaction step to verify complete rollback.

Inject:

- process exceptions;
- database transient errors;
- provider timeouts;
- worker crashes after side effects but before acknowledgement.

## Security tests

- invalid and replayed webhook signatures;
- modified amount/currency/reference;
- authorization bypass attempts;
- object ownership violations;
- mass-assignment payloads;
- oversized requests;
- malicious identifiers and sort fields;
- brute-force and rate-limit behavior;
- refresh-token reuse;
- admin permission escalation.

## Release gates

Production release requires:

- type checking;
- linting;
- unit and integration tests;
- migration validation;
- dependency and secret scanning;
- staging smoke test;
- backup/rollback readiness for risky releases.
