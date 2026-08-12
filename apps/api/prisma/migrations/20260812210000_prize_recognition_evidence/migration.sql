ALTER TABLE "prizes"
ADD COLUMN "distributionRuleVersion" INTEGER,
ADD COLUMN "shareBps" INTEGER;

ALTER TABLE "prizes"
ADD CONSTRAINT "prizes_distribution_rule_version_positive"
CHECK (
  "distributionRuleVersion" IS NULL
  OR "distributionRuleVersion" > 0
);

ALTER TABLE "prizes"
ADD CONSTRAINT "prizes_share_bps_range"
CHECK (
  "shareBps" IS NULL
  OR "shareBps" BETWEEN 1 AND 10000
);

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

  IF NEW."distributionRuleVersion" IS NULL
     OR NEW."distributionRuleVersion" <= 0
  THEN
    RAISE EXCEPTION
      'prize distribution rule version is required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."shareBps" IS NULL
     OR NEW."shareBps" NOT BETWEEN 1 AND 10000
  THEN
    RAISE EXCEPTION
      'prize share basis points are required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

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
    AND NEW."distributionRuleVersion"
      IS NOT DISTINCT FROM
      OLD."distributionRuleVersion"
    AND NEW."shareBps"
      IS NOT DISTINCT FROM
      OLD."shareBps"
    AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'recognized prize financial identity is immutable'
    USING ERRCODE = '55000';
END;
$$;
