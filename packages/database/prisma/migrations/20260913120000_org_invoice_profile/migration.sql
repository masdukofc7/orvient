-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
