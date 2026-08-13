CREATE TYPE "ComplianceOnboardingStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "compliance_onboardings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "dateOfBirth" DATE NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "identityProvider" TEXT NOT NULL,
  "identityEvidenceRef" TEXT NOT NULL,
  "status" "ComplianceOnboardingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByUserId" UUID,
  "decisionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_onboardings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compliance_onboardings_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "compliance_onboardings_user_attempt_key" UNIQUE ("userId", "attemptNumber"),
  CONSTRAINT "compliance_onboardings_country_code" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "compliance_onboardings_attempt_positive" CHECK ("attemptNumber" > 0),
  CONSTRAINT "compliance_onboardings_provider_nonempty" CHECK (length(trim("identityProvider")) > 0),
  CONSTRAINT "compliance_onboardings_evidence_nonempty" CHECK (length(trim("identityEvidenceRef")) > 0),
  CONSTRAINT "compliance_onboardings_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "compliance_onboardings_reviewer_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "compliance_onboardings_one_pending_per_user"
ON "compliance_onboardings"("userId")
WHERE "status" = 'PENDING_REVIEW';

CREATE INDEX "compliance_onboardings_userId_submittedAt_idx"
ON "compliance_onboardings"("userId","submittedAt");

CREATE INDEX "compliance_onboardings_status_submittedAt_idx"
ON "compliance_onboardings"("status","submittedAt");

CREATE TABLE "compliance_verification_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "onboardingId" UUID NOT NULL,
  "evidenceRef" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "verifiedByUserId" UUID NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_verification_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compliance_verification_evidence_onboardingId_key" UNIQUE ("onboardingId"),
  CONSTRAINT "compliance_verification_evidence_ref_nonempty" CHECK (length(trim("evidenceRef")) > 0),
  CONSTRAINT "compliance_verification_evidence_provider_nonempty" CHECK (length(trim("provider")) > 0),
  CONSTRAINT "compliance_verification_evidence_onboarding_fkey"
    FOREIGN KEY ("onboardingId") REFERENCES "compliance_onboardings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "compliance_verification_evidence_verifier_fkey"
    FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "compliance_verification_evidence_verifier_verified_idx"
ON "compliance_verification_evidence"("verifiedByUserId","verifiedAt");

CREATE OR REPLACE FUNCTION restrict_compliance_onboarding_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" = OLD."id"
    AND NEW."userId" = OLD."userId"
    AND NEW."attemptNumber" = OLD."attemptNumber"
    AND NEW."idempotencyKey" = OLD."idempotencyKey"
    AND NEW."dateOfBirth" = OLD."dateOfBirth"
    AND NEW."countryCode" = OLD."countryCode"
    AND NEW."identityProvider" = OLD."identityProvider"
    AND NEW."identityEvidenceRef" = OLD."identityEvidenceRef"
    AND NEW."submittedAt" = OLD."submittedAt"
    AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'compliance onboarding identity evidence is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "compliance_onboardings_restrict_identity_update"
BEFORE UPDATE ON "compliance_onboardings"
FOR EACH ROW EXECUTE FUNCTION restrict_compliance_onboarding_identity();

CREATE OR REPLACE FUNCTION prevent_compliance_onboarding_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance onboarding records cannot be deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "compliance_onboardings_no_delete"
BEFORE DELETE ON "compliance_onboardings"
FOR EACH ROW EXECUTE FUNCTION prevent_compliance_onboarding_delete();

CREATE OR REPLACE FUNCTION prevent_compliance_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance verification evidence is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "compliance_verification_evidence_no_update"
BEFORE UPDATE ON "compliance_verification_evidence"
FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();

CREATE TRIGGER "compliance_verification_evidence_no_delete"
BEFORE DELETE ON "compliance_verification_evidence"
FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();

INSERT INTO "permissions" ("id","code","description")
VALUES
  ('00000000-0000-4000-8000-000000000310','compliance.read.admin','Read player compliance onboarding and protection status'),
  ('00000000-0000-4000-8000-000000000311','compliance.review.admin','Review player compliance onboarding and protection controls')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p
  ON p."code" IN ('compliance.read.admin','compliance.review.admin')
WHERE r."code" = 'PLATFORM_ADMIN'
ON CONFLICT ("roleId","permissionId") DO NOTHING;