-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPPORT', 'OWNER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE';
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
UPDATE "users" SET "platformRole" = 'OWNER' WHERE "isPlatformAdmin" = true;
ALTER TABLE "users" DROP COLUMN "isPlatformAdmin";

ALTER TABLE "organizations" ADD COLUMN "statusReason" TEXT;
ALTER TABLE "organizations" ADD COLUMN "internalNote" TEXT;
