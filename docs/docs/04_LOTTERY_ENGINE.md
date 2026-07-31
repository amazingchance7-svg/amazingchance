# 04 — Lottery Engine and Provable Fairness

## Draw states

Recommended lifecycle:

```text
DRAFT → SCHEDULED → OPEN → CLOSED → COMMITTED → EXECUTING → FINALIZED → PUBLISHED
```

Exceptional states may include `CANCELLED` and `REVIEW_REQUIRED`, each with explicit policy.

## Opening sales

Opening requires validated configuration:

- start and end times;
- ticket price and currency;
- ticket limits;
- prize-distribution version;
- fairness algorithm version;
- jurisdiction configuration;
- publication schedule.

Once sales open, fairness-relevant configuration is immutable or versioned.

## Closing sales

Closing must:

1. prevent new purchase creation;
2. allow only policy-approved in-flight payments;
3. wait for the configured settlement grace period;
4. create a stable eligible-ticket snapshot descriptor;
5. calculate eligible ticket count;
6. calculate a canonical digest;
7. persist closure evidence.

## Canonical ticket set

The eligible ticket set must have an unambiguous order, for example:

```text
ORDER BY numberInDraw ASC
```

Canonical serialization must be versioned. Avoid environment-dependent JSON formatting.

Example conceptual record:

```text
version | drawPublicId | ticketNumber | ticketPublicId | eligibilityFlag
```

The exact byte serialization is specified before implementation and covered by cross-language test vectors.

## Commit-reveal model

A recommended model combines:

- server secret generated with a cryptographically secure RNG;
- commitment published before reveal;
- one or more independent external randomness values available only after commitment;
- deterministic derivation using a versioned cryptographic hash construction.

Conceptual flow:

1. Generate `serverSeed` securely.
2. Publish `commitment = HASH(domain || version || drawId || serverSeed)`.
3. Close and digest the eligible ticket set.
4. Obtain external randomness after the commitment deadline.
5. Reveal `serverSeed`.
6. Derive final random bytes deterministically.
7. map bytes to winners without modulo bias.
8. store complete verification evidence.

## Winner selection

Winner selection must:

- use a documented versioned algorithm;
- avoid modulo bias;
- support multiple unique winners where required;
- define behavior for fewer eligible tickets than prize positions;
- be deterministic for the same inputs;
- produce publicly testable vectors.

## Execution safety

Draw execution runs in a dedicated worker and uses a draw-level database lock or unique execution record.

Only one final result is allowed per draw.

Finalization stores:

- algorithm version;
- ticket-set digest;
- commitment;
- reveal;
- external randomness evidence;
- derived randomness digest;
- selected ticket identifiers;
- execution timestamp;
- software version or build identifier.

## Immutability

After `FINALIZED`, result fields are not updated. Publication is a separate status and must not mutate the result.

Corrections require an exceptional, transparent, audited procedure. They do not overwrite original evidence.
