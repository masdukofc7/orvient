-- Org-scoped membership status (do not flip global users.is_active from org settings).
ALTER TABLE "memberships" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
