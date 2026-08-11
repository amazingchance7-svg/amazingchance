-- SEC-007: immutable audit trail.
ALTER TABLE "audit_logs"
ADD COLUMN IF NOT EXISTS "sealedAt" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
