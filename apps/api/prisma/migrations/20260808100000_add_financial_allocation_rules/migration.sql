ALTER TABLE "allocation_rules"
ADD CONSTRAINT "allocation_rules_weekly_jackpot_bps_range"
CHECK ("weeklyJackpotBps" BETWEEN 0 AND 10000);

ALTER TABLE "allocation_rules"
ADD CONSTRAINT "allocation_rules_annual_jackpot_bps_range"
CHECK ("annualJackpotBps" BETWEEN 0 AND 10000);

ALTER TABLE "allocation_rules"
ADD CONSTRAINT "allocation_rules_company_revenue_bps_range"
CHECK ("companyRevenueBps" BETWEEN 0 AND 10000);

ALTER TABLE "allocation_rules"
ADD CONSTRAINT "allocation_rules_basis_points_total"
CHECK (
  "weeklyJackpotBps"
  + "annualJackpotBps"
  + "companyRevenueBps"
  = 10000
);

ALTER TABLE "allocation_rules"
ADD CONSTRAINT "allocation_rules_effective_interval"
CHECK (
  "effectiveTo" IS NULL
  OR "effectiveTo" > "effectiveFrom"
);

INSERT INTO "allocation_rules" (
  "id",
  "version",
  "weeklyJackpotBps",
  "annualJackpotBps",
  "companyRevenueBps",
  "effectiveFrom",
  "effectiveTo",
  "createdAt"
)
VALUES (
  gen_random_uuid(),
  1,
  7000,
  1000,
  2000,
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  NULL,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("version") DO NOTHING;
