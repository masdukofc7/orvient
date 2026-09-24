-- AlterTable
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "receiptToken" TEXT;

-- Backfill existing rows (cuid-like unique tokens via uuid)
UPDATE "invoices"
SET "receiptToken" = replace(gen_random_uuid()::text, '-', '')
WHERE "receiptToken" IS NULL;

ALTER TABLE "invoices" ALTER COLUMN "receiptToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_receiptToken_key" ON "invoices"("receiptToken");
