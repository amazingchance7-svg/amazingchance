CREATE OR REPLACE FUNCTION protect_ticket_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status"::TEXT = 'FINALIZED' THEN
      RAISE EXCEPTION
        'Finalized snapshots are immutable and cannot be deleted'
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD."status"::TEXT = 'FINALIZED' THEN
    RAISE EXCEPTION
      'Finalized snapshots are immutable and cannot be modified'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status"::TEXT = 'FINALIZED' THEN
    IF OLD."status"::TEXT <> 'BUILDING' THEN
      RAISE EXCEPTION
        'The only permitted snapshot finalization transition is BUILDING to FINALIZED'
        USING ERRCODE = '23514';
    END IF;

    IF
      NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."drawId" IS DISTINCT FROM OLD."drawId"
      OR NEW."ticketCount" IS DISTINCT FROM OLD."ticketCount"
      OR NEW."canonicalFormat" IS DISTINCT FROM OLD."canonicalFormat"
      OR NEW."hashAlgorithm" IS DISTINCT FROM OLD."hashAlgorithm"
      OR NEW."builtAt" IS DISTINCT FROM OLD."builtAt"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION
        'Snapshot identity and canonical fields cannot change during finalization'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."hashAlgorithm" <> 'SHA-256' THEN
      RAISE EXCEPTION
        'Finalized snapshots must use SHA-256'
        USING ERRCODE = '23514';
    END IF;

    IF
      NEW."snapshotHash" IS NULL
      OR NEW."snapshotHash" !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION
        'Finalized snapshots require a valid SHA-256 snapshotHash'
        USING ERRCODE = '23514';
    END IF;

    IF
      NEW."merkleRoot" IS NULL
      OR NEW."merkleRoot" !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION
        'Finalized snapshots require a valid SHA-256 merkleRoot'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."finalizedAt" IS NULL THEN
      RAISE EXCEPTION
        'Finalized snapshots require finalizedAt'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_snapshots_protect_update
BEFORE UPDATE ON "ticket_snapshots"
FOR EACH ROW
EXECUTE FUNCTION protect_ticket_snapshot();

CREATE TRIGGER ticket_snapshots_protect_delete
BEFORE DELETE ON "ticket_snapshots"
FOR EACH ROW
EXECUTE FUNCTION protect_ticket_snapshot();

CREATE OR REPLACE FUNCTION protect_finalized_snapshot_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_snapshot_finalized BOOLEAN := FALSE;
  new_snapshot_finalized BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT EXISTS (
      SELECT 1
      FROM "ticket_snapshots"
      WHERE "id" = OLD."snapshotId"
        AND "status"::TEXT = 'FINALIZED'
    )
    INTO old_snapshot_finalized;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT EXISTS (
      SELECT 1
      FROM "ticket_snapshots"
      WHERE "id" = NEW."snapshotId"
        AND "status"::TEXT = 'FINALIZED'
    )
    INTO new_snapshot_finalized;
  END IF;

  IF old_snapshot_finalized OR new_snapshot_finalized THEN
    RAISE EXCEPTION
      'Entries of a finalized snapshot are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_snapshot_entries_protect_insert
BEFORE INSERT ON "ticket_snapshot_entries"
FOR EACH ROW
EXECUTE FUNCTION protect_finalized_snapshot_entry();

CREATE TRIGGER ticket_snapshot_entries_protect_update
BEFORE UPDATE ON "ticket_snapshot_entries"
FOR EACH ROW
EXECUTE FUNCTION protect_finalized_snapshot_entry();

CREATE TRIGGER ticket_snapshot_entries_protect_delete
BEFORE DELETE ON "ticket_snapshot_entries"
FOR EACH ROW
EXECUTE FUNCTION protect_finalized_snapshot_entry();