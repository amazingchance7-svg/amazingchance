ALTER TABLE "users"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
ADD CONSTRAINT "users_authVersion_positive"
CHECK ("authVersion" >= 1);
