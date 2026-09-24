-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "slug" TEXT;
ALTER TABLE "organizations" ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE';

-- Backfill existing orgs
UPDATE "organizations" SET "slug" = 'demo-wholesale' WHERE "id" = 'seed-org-001' AND "slug" IS NULL;
UPDATE "organizations" SET "slug" = 'org-' || "id" WHERE "slug" IS NULL;

-- Make slug required + unique
ALTER TABLE "organizations" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
