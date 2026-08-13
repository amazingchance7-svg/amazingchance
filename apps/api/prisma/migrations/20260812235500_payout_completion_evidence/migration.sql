CREATE OR REPLACE FUNCTION enforce_payout_completion_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ledger_count INTEGER;
BEGIN
  IF
    OLD."providerTransactionId" IS NOT NULL
    AND NEW."providerTransactionId"
      IS DISTINCT FROM
      OLD."providerTransactionId"
  THEN
    RAISE EXCEPTION
      'payout provider transaction identity is immutable once recorded'
      USING ERRCODE = '55000';
  END IF;

  IF
    NEW."status" = 'SUCCEEDED'
    AND OLD."status" IS DISTINCT FROM 'SUCCEEDED'
  THEN
    IF NEW."providerTransactionId" IS NULL
       OR btrim(NEW."providerTransactionId") = ''
    THEN
      RAISE EXCEPTION
        'successful payout requires provider transaction evidence'
        USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(*)
    INTO ledger_count
    FROM "ledger_transactions"
    WHERE
      "type" = 'PAYOUT_COMPLETED'
      AND "idempotencyKey" =
        'payout-completed:' || NEW."id"::text
      AND "referenceType" = 'PAYOUT'
      AND "referenceId" = NEW."id"::text
      AND "sealedAt" IS NOT NULL;

    IF ledger_count <> 1 THEN
      RAISE EXCEPTION
        'successful payout requires sealed PAYOUT_COMPLETED ledger evidence'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "payouts_validate_completion_evidence"
BEFORE UPDATE ON "payouts"
FOR EACH ROW
EXECUTE FUNCTION enforce_payout_completion_evidence();

CREATE OR REPLACE FUNCTION enforce_paid_prize_payout_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  succeeded_payout_count INTEGER;
BEGIN
  IF
    NEW."status" = 'PAID'
    AND OLD."status" IS DISTINCT FROM 'PAID'
  THEN
    SELECT COUNT(*)
    INTO succeeded_payout_count
    FROM "payouts" payout
    JOIN "ledger_transactions" transaction
      ON transaction."idempotencyKey" =
        'payout-completed:' || payout."id"::text
    WHERE
      payout."prizeId" = NEW."id"
      AND payout."status" = 'SUCCEEDED'
      AND transaction."type" =
        'PAYOUT_COMPLETED'
      AND transaction."referenceType" =
        'PAYOUT'
      AND transaction."referenceId" =
        payout."id"::text
      AND transaction."sealedAt" IS NOT NULL;

    IF succeeded_payout_count <> 1 THEN
      RAISE EXCEPTION
        'PAID prize requires one succeeded payout with sealed ledger evidence'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."paidAt" IS NULL THEN
      RAISE EXCEPTION
        'PAID prize requires paidAt'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "prizes_validate_paid_payout_evidence"
BEFORE UPDATE ON "prizes"
FOR EACH ROW
EXECUTE FUNCTION enforce_paid_prize_payout_evidence();
