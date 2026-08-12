-- SEC-010A: privileged MFA credential storage.
--
-- TOTP secrets are never stored in plaintext. AES-256-GCM ciphertext,
-- IV, and authentication tag are stored separately.

CREATE TABLE "mfa_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "encryptedSecret" TEXT NOT NULL,
  "encryptionIv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "enabledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_credentials_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "mfa_credentials_userId_key"
    UNIQUE ("userId"),
  CONSTRAINT "mfa_credentials_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "mfa_credentials_enabledAt_idx"
ON "mfa_credentials"("enabledAt");

ALTER TABLE "refresh_tokens"
ADD COLUMN "mfaVerified" BOOLEAN NOT NULL DEFAULT false;