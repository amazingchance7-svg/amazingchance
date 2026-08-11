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

-- Runtime DML is intentionally broad across application tables.
-- Immutable tables remain protected by their database triggers.
REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM amazing_chance_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO amazing_chance_runtime;

-- Migration history is administrative metadata only.
REVOKE ALL PRIVILEGES
ON TABLE "_prisma_migrations"
FROM amazing_chance_runtime;

-- Runtime receives sequence access required by ORM inserts, but not
-- ownership or sequence mutation privileges.
REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM amazing_chance_runtime;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO amazing_chance_runtime;

-- Remove PostgreSQL's default PUBLIC function execution. Existing
-- application/integrity functions may execute under the runtime role;
-- they do not confer object ownership or DDL privileges.
REVOKE EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC;

GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
TO amazing_chance_runtime;

-- Future tables created by the same migration owner inherit only
-- ordinary DML for the runtime role. TRUNCATE/TRIGGER/REFERENCES are
-- intentionally absent.
ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE ALL ON TABLES
FROM amazing_chance_runtime;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
TO amazing_chance_runtime;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE ALL ON SEQUENCES
FROM amazing_chance_runtime;

ALTER DEFAULT PRIVILEGES
IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES
TO amazing_chance_runtime;

-- New functions are not executable by PUBLIC. Future privileged
-- SECURITY DEFINER functions must be granted explicitly by migration.
ALTER DEFAULT PRIVILEGES
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC;