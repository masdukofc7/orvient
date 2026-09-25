-- Hot-path indexes for reports + membership lookups
CREATE INDEX IF NOT EXISTS "invoices_organizationId_finalizedAt_idx"
  ON "invoices"("organizationId", "finalizedAt");

CREATE INDEX IF NOT EXISTS "memberships_organizationId_role_idx"
  ON "memberships"("organizationId", "role");

CREATE INDEX IF NOT EXISTS "products_organizationId_updatedAt_idx"
  ON "products"("organizationId", "updatedAt");
