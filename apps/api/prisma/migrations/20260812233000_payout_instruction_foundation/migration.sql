ALTER TABLE "payouts"
ADD COLUMN "destinationRef" TEXT;

CREATE UNIQUE INDEX
  "payouts_prizeId_key"
ON "payouts"("prizeId");

CREATE OR REPLACE FUNCTION enforce_payout_instruction_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prize_user_id UUID;
  prize_amount BIGINT;
  prize_currency CHAR(3);
  prize_status "PrizeStatus";
  claim_id UUID;
  claim_reviewed_at TIMESTAMPTZ(3);
  passed_check_count INTEGER;
BEGIN
  SELECT
    p."userId",
    p."amountMinor",
    p."currency",
    p."status",
    c."id",
    c."reviewedAt"
  INTO
    prize_user_id,
    prize_amount,
    prize_currency,
    prize_status,
    claim_id,
    claim_reviewed_at
  FROM "prizes" p
  LEFT JOIN "prize_claims" c
    ON c."prizeId" = p."id"
  WHERE p."id" = NEW."prizeId";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'payout prize does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."userId" <> prize_user_id THEN
    RAISE EXCEPTION
      'payout user does not own the prize'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."amountMinor" <> prize_amount THEN
    RAISE EXCEPTION
      'payout amount must exactly match recognized prize amount'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."currency" <> prize_currency THEN
    RAISE EXCEPTION
      'payout currency must exactly match recognized prize currency'
      USING ERRCODE = '23514';
  END IF;

  IF prize_status <> 'APPROVED' THEN
    RAISE EXCEPTION
      'payout instruction requires an APPROVED prize'
      USING ERRCODE = '23514';
  END IF;

  IF claim_id IS NULL OR claim_reviewed_at IS NULL THEN
    RAISE EXCEPTION
      'payout instruction requires a reviewed prize claim'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
  INTO passed_check_count
  FROM "prize_eligibility_checks"
  WHERE
    "claimId" = claim_id
    AND "status" = 'PASSED'
    AND "type" IN (
      'IDENTITY',
      'AGE',
      'JURISDICTION'
    );

  IF passed_check_count <> 3 THEN
    RAISE EXCEPTION
      'payout instruction requires all eligibility checks to pass'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."provider" IS NULL
     OR btrim(NEW."provider") = ''
  THEN
    RAISE EXCEPTION
      'payout provider is required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."destinationRef" IS NULL
     OR btrim(NEW."destinationRef") = ''
  THEN
    RAISE EXCEPTION
      'opaque payout destination reference is required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."idempotencyKey" IS NULL
     OR btrim(NEW."idempotencyKey") = ''
  THEN
    RAISE EXCEPTION
      'payout idempotency key is required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "payouts_validate_instruction_identity"
BEFORE INSERT ON "payouts"
FOR EACH ROW
EXECUTE FUNCTION enforce_payout_instruction_identity();

CREATE OR REPLACE FUNCTION restrict_payout_instruction_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW."id" = OLD."id"
    AND NEW."prizeId" = OLD."prizeId"
    AND NEW."userId" = OLD."userId"
    AND NEW."amountMinor" = OLD."amountMinor"
    AND NEW."currency" = OLD."currency"
    AND NEW."idempotencyKey" = OLD."idempotencyKey"
    AND NEW."provider" IS NOT DISTINCT FROM OLD."provider"
    AND NEW."destinationRef" IS NOT DISTINCT FROM OLD."destinationRef"
    AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'payout financial instruction identity is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "payouts_restrict_instruction_update"
BEFORE UPDATE ON "payouts"
FOR EACH ROW
EXECUTE FUNCTION restrict_payout_instruction_update();

CREATE OR REPLACE FUNCTION prevent_payout_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'payout instructions cannot be deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "payouts_no_delete"
BEFORE DELETE ON "payouts"
FOR EACH ROW
EXECUTE FUNCTION prevent_payout_delete();
