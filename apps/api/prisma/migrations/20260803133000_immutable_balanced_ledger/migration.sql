-- Add a sealing timestamp.
ALTER TABLE "ledger_transactions"
ADD COLUMN "sealedAt" TIMESTAMPTZ(3);

ALTER TABLE "ledger_postings"
ADD CONSTRAINT "ledger_postings_amount_positive"
CHECK ("amountMinor" > 0);

CREATE OR REPLACE FUNCTION prevent_ledger_transaction_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'ledger transactions are append-only and cannot be deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ledger_transactions_no_delete"
BEFORE DELETE ON "ledger_transactions"
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_transaction_delete();

CREATE OR REPLACE FUNCTION enforce_ledger_transaction_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."sealedAt" IS NULL
     AND NEW."sealedAt" IS NOT NULL
     AND NEW."id" = OLD."id"
     AND NEW."type" = OLD."type"
     AND NEW."idempotencyKey" = OLD."idempotencyKey"
     AND NEW."referenceType" = OLD."referenceType"
     AND NEW."referenceId" = OLD."referenceId"
     AND NEW."currency" = OLD."currency"
     AND NEW."description" IS NOT DISTINCT FROM OLD."description"
     AND NEW."metadata" IS NOT DISTINCT FROM OLD."metadata"
     AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'sealed ledger transactions are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ledger_transactions_restrict_update"
BEFORE UPDATE ON "ledger_transactions"
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_transaction_update();

CREATE OR REPLACE FUNCTION enforce_ledger_posting_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_sealed_at TIMESTAMPTZ(3);
BEGIN
  SELECT "sealedAt"
  INTO parent_sealed_at
  FROM "ledger_transactions"
  WHERE "id" = NEW."transactionId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'ledger transaction % does not exist',
      NEW."transactionId"
      USING ERRCODE = '23503';
  END IF;

  IF parent_sealed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot append postings to a sealed ledger transaction'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ledger_postings_insert_only_before_seal"
BEFORE INSERT ON "ledger_postings"
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_posting_insert();

CREATE OR REPLACE FUNCTION prevent_ledger_posting_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'ledger postings are append-only and cannot be changed or deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ledger_postings_no_update"
BEFORE UPDATE ON "ledger_postings"
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_posting_mutation();

CREATE TRIGGER "ledger_postings_no_delete"
BEFORE DELETE ON "ledger_postings"
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_posting_mutation();

CREATE OR REPLACE FUNCTION assert_ledger_transaction_balance(
  target_transaction_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  posting_count BIGINT;
  debit_total NUMERIC;
  credit_total NUMERIC;
  parent_sealed_at TIMESTAMPTZ(3);
BEGIN
  SELECT "sealedAt"
  INTO parent_sealed_at
  FROM "ledger_transactions"
  WHERE "id" = target_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'ledger transaction % does not exist',
      target_transaction_id
      USING ERRCODE = '23503';
  END IF;

  IF parent_sealed_at IS NULL THEN
    RAISE EXCEPTION
      'ledger transaction % must be sealed before commit',
      target_transaction_id
      USING ERRCODE = '23514';
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'DEBIT'), 0),
    COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'CREDIT'), 0)
  INTO
    posting_count,
    debit_total,
    credit_total
  FROM "ledger_postings"
  WHERE "transactionId" = target_transaction_id;

  IF posting_count < 2 THEN
    RAISE EXCEPTION
      'ledger transaction % must have at least two postings',
      target_transaction_id
      USING ERRCODE = '23514';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION
      'ledger transaction % is not balanced: debit %, credit %',
      target_transaction_id,
      debit_total,
      credit_total
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ledger_transaction_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_ledger_transaction_balance(NEW."id");
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ledger_posting_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_ledger_transaction_balance(NEW."transactionId");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ledger_transactions_validate_on_commit"
AFTER INSERT OR UPDATE ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_transaction_row();

CREATE CONSTRAINT TRIGGER "ledger_postings_validate_on_commit"
AFTER INSERT ON "ledger_postings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_posting_row();

CREATE INDEX "ledger_transactions_sealedAt_idx"
ON "ledger_transactions"("sealedAt");
