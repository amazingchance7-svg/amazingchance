CREATE TYPE "PrizeEligibilityCheckType" AS ENUM ('IDENTITY','AGE','JURISDICTION');
CREATE TYPE "PrizeEligibilityCheckStatus" AS ENUM ('PASSED','FAILED');

CREATE TABLE "prize_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "prizeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "declaredDateOfBirth" DATE NOT NULL,
  "declaredCountryCode" CHAR(2) NOT NULL,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByUserId" UUID,
  "decisionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prize_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_claims_prizeId_key" UNIQUE ("prizeId"),
  CONSTRAINT "prize_claims_country_code" CHECK ("declaredCountryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "prize_claims_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prizes"("id") ON DELETE RESTRICT,
  CONSTRAINT "prize_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "prize_claims_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "prize_eligibility_checks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "claimId" UUID NOT NULL,
  "type" "PrizeEligibilityCheckType" NOT NULL,
  "status" "PrizeEligibilityCheckStatus" NOT NULL,
  "evidence" JSONB NOT NULL,
  "checkedByUserId" UUID NOT NULL,
  "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prize_eligibility_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prize_eligibility_checks_claimId_type_key" UNIQUE ("claimId","type"),
  CONSTRAINT "prize_eligibility_checks_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "prize_claims"("id") ON DELETE RESTRICT,
  CONSTRAINT "prize_eligibility_checks_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION enforce_prize_claim_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prize_user_id UUID; prize_status "PrizeStatus";
BEGIN
  SELECT "userId","status" INTO prize_user_id, prize_status FROM "prizes" WHERE "id" = NEW."prizeId";
  IF NOT FOUND THEN RAISE EXCEPTION 'prize claim prize does not exist' USING ERRCODE='23503'; END IF;
  IF NEW."userId" <> prize_user_id THEN RAISE EXCEPTION 'prize claim user does not own the prize' USING ERRCODE='23514'; END IF;
  IF prize_status <> 'CREATED' THEN RAISE EXCEPTION 'prize must be CREATED when claim is submitted' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "prize_claims_validate_identity"
BEFORE INSERT ON "prize_claims"
FOR EACH ROW EXECUTE FUNCTION enforce_prize_claim_identity();

CREATE OR REPLACE FUNCTION restrict_prize_claim_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id"=OLD."id"
     AND NEW."prizeId"=OLD."prizeId"
     AND NEW."userId"=OLD."userId"
     AND NEW."declaredDateOfBirth"=OLD."declaredDateOfBirth"
     AND NEW."declaredCountryCode"=OLD."declaredCountryCode"
     AND NEW."submittedAt"=OLD."submittedAt"
     AND NEW."createdAt"=OLD."createdAt"
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'prize claim submitted identity is immutable' USING ERRCODE='55000';
END $$;

CREATE TRIGGER "prize_claims_restrict_update"
BEFORE UPDATE ON "prize_claims"
FOR EACH ROW EXECUTE FUNCTION restrict_prize_claim_update();

CREATE OR REPLACE FUNCTION prevent_prize_claim_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prize claims cannot be deleted' USING ERRCODE='55000';
END $$;

CREATE TRIGGER "prize_claims_no_delete"
BEFORE DELETE ON "prize_claims"
FOR EACH ROW EXECUTE FUNCTION prevent_prize_claim_delete();

CREATE OR REPLACE FUNCTION prevent_prize_eligibility_check_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prize eligibility checks are immutable' USING ERRCODE='55000';
END $$;

CREATE TRIGGER "prize_eligibility_checks_no_update"
BEFORE UPDATE ON "prize_eligibility_checks"
FOR EACH ROW EXECUTE FUNCTION prevent_prize_eligibility_check_mutation();

CREATE TRIGGER "prize_eligibility_checks_no_delete"
BEFORE DELETE ON "prize_eligibility_checks"
FOR EACH ROW EXECUTE FUNCTION prevent_prize_eligibility_check_mutation();

INSERT INTO "permissions" ("id","code","description")
VALUES ('00000000-0000-4000-8000-000000000308','prize.claim.review.admin','Review winner claims and record prize eligibility decisions')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code"='PLATFORM_ADMIN' AND p."code"='prize.claim.review.admin'
ON CONFLICT ("roleId","permissionId") DO NOTHING;
