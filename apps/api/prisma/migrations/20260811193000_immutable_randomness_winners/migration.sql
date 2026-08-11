-- SEC-005 Immutable randomness and winners.

CREATE OR REPLACE FUNCTION prevent_terminal_randomness_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Randomness evidence cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."drawId" IS DISTINCT FROM OLD."drawId"
    OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestedMin" IS DISTINCT FROM OLD."requestedMin"
    OR NEW."requestedMax" IS DISTINCT FROM OLD."requestedMax"
    OR NEW."requestedCount" IS DISTINCT FROM OLD."requestedCount"
    OR NEW."requestPayload" IS DISTINCT FROM OLD."requestPayload"
    OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION
      'Committed randomness request fields are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('VERIFIED', 'REJECTED', 'FAILED') THEN
    RAISE EXCEPTION
      'Terminal randomness evidence is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF
    OLD."responsePayload" IS NOT NULL
    AND NEW."responsePayload" IS DISTINCT FROM OLD."responsePayload"
  THEN
    RAISE EXCEPTION
      'Received randomness response payload is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF
    OLD."responseHash" IS NOT NULL
    AND NEW."responseHash" IS DISTINCT FROM OLD."responseHash"
  THEN
    RAISE EXCEPTION
      'Received randomness response hash is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF
    OLD."providerSignature" IS NOT NULL
    AND NEW."providerSignature" IS DISTINCT FROM OLD."providerSignature"
  THEN
    RAISE EXCEPTION
      'Received randomness provider signature is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF
    OLD."randomPositions" IS NOT NULL
    AND NEW."randomPositions" IS DISTINCT FROM OLD."randomPositions"
  THEN
    RAISE EXCEPTION
      'Received random positions are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS randomness_evidence_prevent_update
ON "randomness_evidence";

CREATE TRIGGER randomness_evidence_prevent_update
BEFORE UPDATE ON "randomness_evidence"
FOR EACH ROW
EXECUTE FUNCTION prevent_terminal_randomness_mutation();

DROP TRIGGER IF EXISTS randomness_evidence_prevent_delete
ON "randomness_evidence";

CREATE TRIGGER randomness_evidence_prevent_delete
BEFORE DELETE ON "randomness_evidence"
FOR EACH ROW
EXECUTE FUNCTION prevent_terminal_randomness_mutation();


CREATE OR REPLACE FUNCTION enforce_draw_winner_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  entry_row RECORD;
  draw_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Draw winners are immutable and cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'Draw winners are immutable and cannot be modified'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    e."ticketId",
    e."position",
    s."drawId"
  INTO entry_row
  FROM "ticket_snapshot_entries" AS e
  JOIN "ticket_snapshots" AS s
    ON s."id" = e."snapshotId"
  WHERE e."id" = NEW."snapshotEntryId";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Winner snapshot entry does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF
    NEW."ticketId" IS DISTINCT FROM entry_row."ticketId"
    OR NEW."drawId" IS DISTINCT FROM entry_row."drawId"
    OR NEW."randomPosition" IS DISTINCT FROM entry_row."position"
  THEN
    RAISE EXCEPTION
      'Winner must match its finalized snapshot entry'
      USING ERRCODE = '23514';
  END IF;

  SELECT d."status"::TEXT
  INTO draw_status
  FROM "lottery_draws" AS d
  WHERE d."id" = NEW."drawId";

  IF draw_status IS DISTINCT FROM 'WINNER_SELECTION_PENDING' THEN
    RAISE EXCEPTION
      'Winners can only be inserted while winner selection is pending'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draw_winners_enforce_integrity
ON "draw_winners";

CREATE TRIGGER draw_winners_enforce_integrity
BEFORE INSERT OR UPDATE OR DELETE ON "draw_winners"
FOR EACH ROW
EXECUTE FUNCTION enforce_draw_winner_integrity();
