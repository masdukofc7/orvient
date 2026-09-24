-- Dedupe barcodes before unique (keep newest; null the rest — Postgres allows multiple NULLs)
UPDATE "products" AS p
SET "barcode" = NULL
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "barcode"
      ORDER BY "updatedAt" DESC, id DESC
    ) AS rn
  FROM "products"
  WHERE "barcode" IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

DROP INDEX IF EXISTS "products_organizationId_barcode_idx";

CREATE UNIQUE INDEX "products_organizationId_barcode_key" ON "products"("organizationId", "barcode");
