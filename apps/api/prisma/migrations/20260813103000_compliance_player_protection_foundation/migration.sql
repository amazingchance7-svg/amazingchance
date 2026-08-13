CREATE TYPE "PlayerProtectionStatus" AS ENUM (
  'ACTIVE',
  'SELF_EXCLUDED',
  'SUSPENDED',
  'COMPLIANCE_HOLD'
);

CREATE TABLE "jurisdiction_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "minimumAge" INTEGER NOT NULL,
  "purchasesAllowed" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jurisdiction_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jurisdiction_policies_version_key" UNIQUE ("version"),
  CONSTRAINT "jurisdiction_policies_country_code" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "jurisdiction_policies_minimum_age" CHECK ("minimumAge" BETWEEN 0 AND 120),
  CONSTRAINT "jurisdiction_policies_effective_range" CHECK (
    "effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"
  )
);

CREATE INDEX "jurisdiction_policies_countryCode_effectiveFrom_effectiveTo_idx"
ON "jurisdiction_policies"("countryCode","effectiveFrom","effectiveTo");

CREATE TABLE "player_compliance_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "dateOfBirth" DATE NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "status" "PlayerProtectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "statusReason" TEXT,
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_compliance_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "player_compliance_profiles_userId_key" UNIQUE ("userId"),
  CONSTRAINT "player_compliance_profiles_country_code" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "player_compliance_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "player_compliance_profiles_status_countryCode_idx"
ON "player_compliance_profiles"("status","countryCode");

CREATE TABLE "self_exclusions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ(3),
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "self_exclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "self_exclusions_range" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "self_exclusions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "self_exclusions_userId_startsAt_endsAt_idx"
ON "self_exclusions"("userId","startsAt","endsAt");

CREATE OR REPLACE FUNCTION prevent_jurisdiction_policy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'jurisdiction policies are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "jurisdiction_policies_no_update"
BEFORE UPDATE ON "jurisdiction_policies"
FOR EACH ROW EXECUTE FUNCTION prevent_jurisdiction_policy_mutation();

CREATE TRIGGER "jurisdiction_policies_no_delete"
BEFORE DELETE ON "jurisdiction_policies"
FOR EACH ROW EXECUTE FUNCTION prevent_jurisdiction_policy_mutation();

CREATE OR REPLACE FUNCTION restrict_verified_compliance_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    NEW."id" = OLD."id"
    AND NEW."userId" = OLD."userId"
    AND NEW."dateOfBirth" = OLD."dateOfBirth"
    AND NEW."countryCode" = OLD."countryCode"
    AND NEW."verifiedAt" = OLD."verifiedAt"
    AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'verified compliance identity is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "player_compliance_profiles_restrict_identity_update"
BEFORE UPDATE ON "player_compliance_profiles"
FOR EACH ROW EXECUTE FUNCTION restrict_verified_compliance_identity();

CREATE OR REPLACE FUNCTION prevent_compliance_profile_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'player compliance profiles cannot be deleted' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "player_compliance_profiles_no_delete"
BEFORE DELETE ON "player_compliance_profiles"
FOR EACH ROW EXECUTE FUNCTION prevent_compliance_profile_delete();

CREATE OR REPLACE FUNCTION prevent_self_exclusion_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'self-exclusion records are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "self_exclusions_no_update"
BEFORE UPDATE ON "self_exclusions"
FOR EACH ROW EXECUTE FUNCTION prevent_self_exclusion_mutation();

CREATE TRIGGER "self_exclusions_no_delete"
BEFORE DELETE ON "self_exclusions"
FOR EACH ROW EXECUTE FUNCTION prevent_self_exclusion_mutation();
