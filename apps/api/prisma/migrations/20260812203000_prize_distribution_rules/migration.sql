CREATE TABLE "prize_distribution_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL,
  "drawType" "DrawType" NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prize_distribution_rules_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "prize_distribution_rules_version_key"
    UNIQUE ("version"),
  CONSTRAINT "prize_distribution_rules_effective_interval"
    CHECK (
      "effectiveTo" IS NULL
      OR "effectiveTo" > "effectiveFrom"
    )
);

CREATE INDEX
  "prize_distribution_rules_drawType_effectiveFrom_effectiveTo_idx"
ON "prize_distribution_rules"(
  "drawType",
  "effectiveFrom",
  "effectiveTo"
);

CREATE TABLE "prize_distribution_rule_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ruleId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "shareBps" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prize_distribution_rule_entries_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "prize_distribution_rule_entries_ruleId_rank_key"
    UNIQUE ("ruleId", "rank"),
  CONSTRAINT "prize_distribution_rule_entries_rank_positive"
    CHECK ("rank" > 0),
  CONSTRAINT "prize_distribution_rule_entries_share_bps_range"
    CHECK ("shareBps" BETWEEN 1 AND 10000),
  CONSTRAINT "prize_distribution_rule_entries_ruleId_fkey"
    FOREIGN KEY ("ruleId")
    REFERENCES "prize_distribution_rules"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX
  "prize_distribution_rule_entries_ruleId_rank_idx"
ON "prize_distribution_rule_entries"(
  "ruleId",
  "rank"
);

INSERT INTO "prize_distribution_rules" (
  "id",
  "version",
  "drawType",
  "effectiveFrom",
  "effectiveTo",
  "createdAt"
)
VALUES
(
  '15000000-0000-4000-8000-000000000001',
  1,
  'WEEKLY',
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  NULL,
  CURRENT_TIMESTAMP
),
(
  '15000000-0000-4000-8000-000000000002',
  2,
  'ANNUAL',
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  NULL,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("version") DO NOTHING;

INSERT INTO "prize_distribution_rule_entries" (
  "id",
  "ruleId",
  "rank",
  "shareBps",
  "createdAt"
)
VALUES
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000001',
  1,
  5000,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000001',
  2,
  3000,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000001',
  3,
  2000,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000002',
  1,
  5000,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000002',
  2,
  3000,
  CURRENT_TIMESTAMP
),
(
  gen_random_uuid(),
  '15000000-0000-4000-8000-000000000002',
  3,
  2000,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("ruleId", "rank") DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_prize_rule_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'prize distribution rules are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "prize_distribution_rules_no_update"
BEFORE UPDATE ON "prize_distribution_rules"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_rule_mutation();

CREATE TRIGGER "prize_distribution_rules_no_delete"
BEFORE DELETE ON "prize_distribution_rules"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_rule_mutation();

CREATE TRIGGER "prize_distribution_rule_entries_no_update"
BEFORE UPDATE ON "prize_distribution_rule_entries"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_rule_mutation();

CREATE TRIGGER "prize_distribution_rule_entries_no_delete"
BEFORE DELETE ON "prize_distribution_rule_entries"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_rule_mutation();

CREATE OR REPLACE FUNCTION enforce_prize_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  winner_draw_id UUID;
  winner_rank INTEGER;
  winner_user_id UUID;
BEGIN
  SELECT
    w."drawId",
    w."rank",
    t."userId"
  INTO
    winner_draw_id,
    winner_rank,
    winner_user_id
  FROM "draw_winners" w
  JOIN "tickets" t
    ON t."id" = w."ticketId"
  WHERE w."id" = NEW."winnerId";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'prize winner does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."drawId" <> winner_draw_id THEN
    RAISE EXCEPTION
      'prize draw does not match winner draw'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."rank" <> winner_rank THEN
    RAISE EXCEPTION
      'prize rank does not match winner rank'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."userId" <> winner_user_id THEN
    RAISE EXCEPTION
      'prize user does not own the winning ticket'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."amountMinor" <= 0 THEN
    RAISE EXCEPTION
      'prize amount must be positive'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."currency" !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION
      'prize currency must be a three-letter uppercase code'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "prizes_validate_identity"
BEFORE INSERT ON "prizes"
FOR EACH ROW
EXECUTE FUNCTION enforce_prize_identity();

CREATE OR REPLACE FUNCTION enforce_prize_recognition_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW."id" = OLD."id"
    AND NEW."drawId" = OLD."drawId"
    AND NEW."winnerId" = OLD."winnerId"
    AND NEW."userId" = OLD."userId"
    AND NEW."rank" = OLD."rank"
    AND NEW."amountMinor" = OLD."amountMinor"
    AND NEW."currency" = OLD."currency"
    AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'recognized prize financial identity is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "prizes_restrict_recognition_update"
BEFORE UPDATE ON "prizes"
FOR EACH ROW
EXECUTE FUNCTION enforce_prize_recognition_immutability();

CREATE OR REPLACE FUNCTION prevent_prize_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'recognized prizes cannot be deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "prizes_no_delete"
BEFORE DELETE ON "prizes"
FOR EACH ROW
EXECUTE FUNCTION prevent_prize_delete();
