-- Multi-branch stock + product catalog fields

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
CREATE INDEX IF NOT EXISTS "products_organizationId_category_idx" ON "products"("organizationId", "category");

CREATE TABLE IF NOT EXISTS "branch_stocks" (
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_stocks_pkey" PRIMARY KEY ("productId","branchId")
);

CREATE INDEX IF NOT EXISTS "branch_stocks_branchId_idx" ON "branch_stocks"("branchId");

DO $$ BEGIN
  ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure every org has a default branch
INSERT INTO "branches" ("id", "organizationId", "name", "code", "isDefault", "createdAt", "updatedAt")
SELECT
  'mig-branch-' || o."id",
  o."id",
  'Main',
  'MAIN',
  true,
  NOW(),
  NOW()
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "branches" b WHERE b."organizationId" = o."id"
);

UPDATE "branches" b
SET "isDefault" = true
WHERE b."id" = (
  SELECT b2."id" FROM "branches" b2
  WHERE b2."organizationId" = b."organizationId"
  ORDER BY b2."createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "branches" b3
  WHERE b3."organizationId" = b."organizationId" AND b3."isDefault" = true
);

-- Move existing Product.stock onto each org's default branch
INSERT INTO "branch_stocks" ("productId", "branchId", "quantity", "updatedAt")
SELECT p."id", b."id", p."stock", NOW()
FROM "products" p
INNER JOIN "branches" b ON b."organizationId" = p."organizationId" AND b."isDefault" = true
ON CONFLICT ("productId", "branchId") DO UPDATE
SET "quantity" = EXCLUDED."quantity", "updatedAt" = NOW();

-- Backfill null branchIds on stock-related rows
UPDATE "inventory_transactions" t
SET "branchId" = b."id"
FROM "branches" b
WHERE t."branchId" IS NULL
  AND b."organizationId" = t."organizationId"
  AND b."isDefault" = true;

UPDATE "invoices" i
SET "branchId" = b."id"
FROM "branches" b
WHERE i."branchId" IS NULL
  AND b."organizationId" = i."organizationId"
  AND b."isDefault" = true;

UPDATE "purchase_orders" po
SET "branchId" = b."id"
FROM "branches" b
WHERE po."branchId" IS NULL
  AND b."organizationId" = po."organizationId"
  AND b."isDefault" = true;
