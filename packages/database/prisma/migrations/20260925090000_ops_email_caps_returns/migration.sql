-- Plan hard caps (0 = unlimited)
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "maxUsers" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "maxBranches" INTEGER NOT NULL DEFAULT 1;

UPDATE "plans" SET "maxUsers" = 3, "maxBranches" = 1 WHERE "slug" = 'starter';
UPDATE "plans" SET "maxUsers" = 10, "maxBranches" = 3 WHERE "slug" = 'growth';
UPDATE "plans" SET "maxUsers" = 25, "maxBranches" = 0 WHERE "slug" = 'scale';

-- Partial invoice returns
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "quantityReturned" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- Password reset + invites
DO $$ BEGIN
  CREATE TYPE "AuthTokenType" AS ENUM ('PASSWORD_RESET', 'INVITE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" TEXT NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "membershipRole" "MembershipRole",
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "auth_tokens_email_type_idx" ON "auth_tokens"("email", "type");
CREATE INDEX IF NOT EXISTS "auth_tokens_expiresAt_idx" ON "auth_tokens"("expiresAt");
