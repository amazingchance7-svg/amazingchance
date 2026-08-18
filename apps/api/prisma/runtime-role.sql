-- SEC-006 PostgreSQL runtime least-privilege role.
--
-- Apply as database owner / migration administrator.
-- Application login roles receive membership in this NOLOGIN role.
--
-- Security boundary:
--   * runtime may perform ordinary application DML;
--   * DB triggers/constraints enforce immutable business invariants;
--   * runtime is not an object owner and cannot disable those controls;
--   * DDL, TRUNCATE, TRIGGER and migration-history access are denied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'amazing_chance_runtime'
  ) THEN
    CREATE ROLE amazing_chance_runtime
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

-- PUBLIC must not be able to create objects in the application schema.
REVOKE CREATE
ON SCHEMA public
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON SCHEMA public
FROM amazing_chance_runtime;

GRANT USAGE
ON SCHEMA public
TO amazing_chance_runtime;

-- SEC-026 default runtime compromise-containment policy.
--
-- The default application credential may read current
-- application state, but integrity-critical mutations belong
-- exclusively to dedicated payment/draw/claim/payout roles.
--
-- Current non-critical tables retain ordinary application DML
-- to preserve existing public/auth/compliance functionality.
-- Future tables receive no automatic runtime privileges.

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM amazing_chance_runtime;

-- Read access is intentionally allowed for current application
-- tables, including public verification of critical state.
GRANT SELECT
ON TABLE
  "allocation_rules",
  "audit_logs",
  "compliance_onboardings",
  "compliance_verification_evidence",
  "draw_winners",
  "jurisdiction_policies",
  "ledger_postings",
  "ledger_transactions",
  "lottery_draws",
  "mfa_credentials",
  "notification_outbox",
  "payment_attempts",
  "payments",
  "payouts",
  "permissions",
  "player_compliance_profiles",
  "prize_claims",
  "prize_distribution_rule_entries",
  "prize_distribution_rules",
  "prize_eligibility_checks",
  "prizes",
  "purchase_state_events",
  "purchases",
  "randomness_evidence",
  "refresh_tokens",
  "role_permissions",
  "roles",
  "self_exclusions",
  "ticket_allocations",
  "ticket_sequences",
  "ticket_snapshot_entries",
  "ticket_snapshots",
  "tickets",
  "user_roles",
  "user_tokens",
  "users",
  "webhook_events"
TO amazing_chance_runtime;

-- Mutation authority is explicit and excludes all SEC-026
-- integrity-critical tables.
GRANT INSERT, UPDATE, DELETE
ON TABLE
  "compliance_onboardings",
  "compliance_verification_evidence",
  "jurisdiction_policies",
  "mfa_credentials",
  "notification_outbox",
  "permissions",
  "player_compliance_profiles",
  "purchase_state_events",
  "purchases",
  "refresh_tokens",
  "role_permissions",
  "roles",
  "self_exclusions",
  "user_roles",
  "user_tokens",
  "users"
TO amazing_chance_runtime;

-- Audit evidence remains append-only.
GRANT INSERT
ON TABLE "audit_logs"
TO amazing_chance_runtime;

-- Prisma migration history remains administrative metadata.
REVOKE ALL PRIVILEGES
ON TABLE "_prisma_migrations"
FROM amazing_chance_runtime;

-- Reset sequence privileges inherited from the previous policy.
-- Existing application sequences may be consumed, but future
-- sequences receive no automatic runtime privileges.
REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM amazing_chance_runtime;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO amazing_chance_runtime;

-- Do not expose every application function to the default role.
-- Trigger execution does not require broad direct EXECUTE grants.
REVOKE EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC;

REVOKE EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
FROM amazing_chance_runtime;

-- Fail closed for objects created by future migrations.
-- Deployment must explicitly grant privileges for new objects.
ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE ALL ON TABLES
FROM amazing_chance_runtime;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE ALL ON SEQUENCES
FROM amazing_chance_runtime;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM amazing_chance_runtime;

-- New functions are never executable through PUBLIC by default.
ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC;

-- SEC-026 compromise-containment security domains.
--
-- These NOLOGIN roles are intentionally separate from the default
-- application runtime role. Login credentials receive membership
-- only in the security domain they execute.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'amazing_chance_payment'
  ) THEN
    CREATE ROLE amazing_chance_payment
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'amazing_chance_draw'
  ) THEN
    CREATE ROLE amazing_chance_draw
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'amazing_chance_payout'
  ) THEN
    CREATE ROLE amazing_chance_payout
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES
ON SCHEMA public
FROM
  amazing_chance_payment,
  amazing_chance_draw,
  amazing_chance_payout;

GRANT USAGE
ON SCHEMA public
TO
  amazing_chance_payment,
  amazing_chance_draw,
  amazing_chance_payout;

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM
  amazing_chance_payment,
  amazing_chance_draw,
  amazing_chance_payout;

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM
  amazing_chance_payment,
  amazing_chance_draw,
  amazing_chance_payout;
-- SEC-026 prize-claim security domain.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'amazing_chance_claim'
  ) THEN
    CREATE ROLE amazing_chance_claim
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES
ON SCHEMA public
FROM amazing_chance_claim;

GRANT USAGE
ON SCHEMA public
TO amazing_chance_claim;

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM amazing_chance_claim;

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM amazing_chance_claim;
-- Ledger-writing security domains must be able to execute the
-- deferred balanced-ledger invariant validator. Keep this grant
-- explicit rather than granting EXECUTE on all functions.
GRANT EXECUTE
ON FUNCTION public.assert_ledger_transaction_balance(UUID)
TO
  amazing_chance_payment,
  amazing_chance_draw,
  amazing_chance_payout;

-- ============================================================
-- SEC-026 specialized privilege matrix
-- ============================================================
--
-- These roles are fail-closed:
--   * no DELETE privileges;
--   * no DDL/TRUNCATE/TRIGGER ownership;
--   * mutation privileges are restricted to each security domain;
--   * future tables receive no automatic specialized-role DML.

-- ------------------------------------------------------------
-- PAYMENT DOMAIN
-- ------------------------------------------------------------

GRANT SELECT
ON TABLE
  "users",
  "purchases",
  "purchase_state_events",
  "payments",
  "payment_attempts",
  "webhook_events",
  "lottery_draws",
  "tickets",
  "ticket_allocations",
  "ticket_sequences",
  "ticket_snapshots",
  "allocation_rules",
  "ledger_transactions",
  "ledger_postings",
  "notification_outbox",
  "player_compliance_profiles",
  "self_exclusions",
  "jurisdiction_policies",
  "audit_logs"
TO amazing_chance_payment;

GRANT INSERT
ON TABLE
  "payments",
  "payment_attempts",
  "webhook_events",
  "ledger_transactions",
  "ledger_postings",
  "ticket_sequences",
  "ticket_allocations",
  "tickets",
  "purchase_state_events",
  "notification_outbox",
  "audit_logs"
TO amazing_chance_payment;

GRANT UPDATE
ON TABLE
  "payments",
  "payment_attempts",
  "webhook_events",
  "purchases",
  "tickets",
  "ticket_sequences",
  "ledger_transactions",
  "notification_outbox"
TO amazing_chance_payment;

-- Payment flows lock users and draws but must not receive general
-- mutation authority over those security domains.
GRANT UPDATE ("updatedAt")
ON TABLE "users"
TO amazing_chance_payment;

GRANT UPDATE ("updatedAt")
ON TABLE "lottery_draws"
TO amazing_chance_payment;

-- ------------------------------------------------------------
-- DRAW / RANDOMNESS / WINNER DOMAIN
-- ------------------------------------------------------------

GRANT SELECT
ON TABLE
  "lottery_draws",
  "purchases",
  "tickets",
  "ticket_snapshots",
  "ticket_snapshot_entries",
  "randomness_evidence",
  "draw_winners",
  "prizes",
  "prize_distribution_rules",
  "prize_distribution_rule_entries",
  "ledger_transactions",
  "ledger_postings",
  "notification_outbox"
TO amazing_chance_draw;

-- Draw publication needs only recipient identity and email.
-- Keep user-table access column-scoped.
GRANT SELECT ("id", "email")
ON TABLE "users"
TO amazing_chance_draw;

GRANT INSERT
ON TABLE
  "lottery_draws",
  "ticket_snapshots",
  "ticket_snapshot_entries",
  "randomness_evidence",
  "draw_winners",
  "prizes",
  "ledger_transactions",
  "ledger_postings",
  "notification_outbox"
TO amazing_chance_draw;

GRANT UPDATE
ON TABLE
  "lottery_draws",
  "ticket_snapshots",
  "randomness_evidence",
  "ledger_transactions"
TO amazing_chance_draw;

-- ------------------------------------------------------------
-- PRIZE CLAIM / ELIGIBILITY DOMAIN
-- ------------------------------------------------------------

GRANT SELECT
ON TABLE
  "prizes",
  "prize_claims",
  "prize_eligibility_checks"
TO amazing_chance_claim;

GRANT INSERT
ON TABLE
  "prize_claims",
  "prize_eligibility_checks"
TO amazing_chance_claim;

GRANT UPDATE
ON TABLE
  "prizes",
  "prize_claims"
TO amazing_chance_claim;

-- ------------------------------------------------------------
-- PAYOUT DOMAIN
-- ------------------------------------------------------------

GRANT SELECT
ON TABLE
  "payouts",
  "prizes",
  "prize_claims",
  "prize_eligibility_checks",
  "ledger_transactions",
  "ledger_postings"
TO amazing_chance_payout;

GRANT INSERT
ON TABLE
  "payouts",
  "ledger_transactions",
  "ledger_postings"
TO amazing_chance_payout;

GRANT UPDATE
ON TABLE
  "payouts",
  "prizes",
  "ledger_transactions"
TO amazing_chance_payout;
