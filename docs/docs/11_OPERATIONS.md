# 11 — Operations and Recovery

## Environments

- `local`: developer environment.
- `test`: automated integration environment.
- `staging`: production-like validation.
- `production`: real users and funds.

Credentials and databases are fully separated.

## Deployment

Recommended flow:

1. immutable build artifact;
2. automated tests and scans;
3. migration review;
4. deploy to staging;
5. smoke and reconciliation tests;
6. controlled production rollout;
7. post-deploy monitoring.

## Database migrations

Migrations run once through a controlled job. Application replicas do not race to apply migrations.

Risky migrations use expand-and-contract:

1. add compatible schema;
2. deploy compatible code;
3. backfill;
4. switch reads/writes;
5. remove obsolete schema later.

## Backups

- automated backups;
- point-in-time recovery where available;
- encrypted storage;
- retention policy;
- separate failure domain;
- periodic restoration test.

A backup is not considered effective until a restoration has succeeded.

## Recovery objectives

RPO and RTO must be formally approved before launch. Financial and draw evidence usually require a low RPO.

## Disaster recovery

Document procedures for:

- database restore;
- secret rotation;
- payment-provider failover or outage;
- corrupted deployment rollback;
- outbox replay;
- draw execution interruption;
- compromise of privileged credentials.

## Health endpoints

- Liveness: process can run.
- Readiness: required dependencies permit traffic.
- Deep diagnostics are authenticated and not exposed publicly.

## Incident response

Incidents have:

- severity levels;
- on-call ownership;
- containment steps;
- evidence preservation;
- customer and regulatory communication policy;
- post-incident review;
- tracked corrective actions.

## Emergency changes

Direct database intervention is exceptional. It requires authorization, peer review where possible, recorded commands, evidence, and a post-incident reconciliation.
