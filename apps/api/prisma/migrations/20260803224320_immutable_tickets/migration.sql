CREATE OR REPLACE FUNCTION prevent_ticket_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Tickets are immutable and cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."publicId" IS DISTINCT FROM OLD."publicId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."purchaseId" IS DISTINCT FROM OLD."purchaseId"
    OR NEW."drawId" IS DISTINCT FROM OLD."drawId"
    OR NEW."numberInDraw" IS DISTINCT FROM OLD."numberInDraw"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
  THEN
    RAISE EXCEPTION
      'Immutable ticket identity fields cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'VOIDED_BY_REFUND' THEN
    RAISE EXCEPTION
      'A voided ticket cannot be modified'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" <> 'VOIDED_BY_REFUND' THEN
    RAISE EXCEPTION
      'The only permitted ticket transition is ACTIVE to VOIDED_BY_REFUND'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."voidedAt" IS NULL OR NULLIF(BTRIM(NEW."voidReason"), '') IS NULL THEN
    RAISE EXCEPTION
      'Voiding a ticket requires voidedAt and voidReason'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_prevent_update
BEFORE UPDATE ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION prevent_ticket_mutation();

CREATE TRIGGER tickets_prevent_delete
BEFORE DELETE ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION prevent_ticket_mutation();