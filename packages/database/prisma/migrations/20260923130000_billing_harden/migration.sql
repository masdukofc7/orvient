-- Harden billing for production: period start, price snapshot, idempotent gateway ids

ALTER TABLE "organization_subscriptions" ADD COLUMN IF NOT EXISTS "currentPeriodStart" TIMESTAMP(3);

DROP INDEX IF EXISTS "organization_subscriptions_status_idx";
CREATE INDEX IF NOT EXISTS "organization_subscriptions_status_currentPeriodEnd_idx" ON "organization_subscriptions"("status", "currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "organization_subscriptions_gatewayCustomerId_idx" ON "organization_subscriptions"("gatewayCustomerId");
CREATE INDEX IF NOT EXISTS "organization_subscriptions_gatewaySubscriptionId_idx" ON "organization_subscriptions"("gatewaySubscriptionId");

ALTER TABLE "billing_requests" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(19,2);
ALTER TABLE "billing_requests" ADD COLUMN IF NOT EXISTS "currency" CHAR(3);
ALTER TABLE "billing_requests" ADD COLUMN IF NOT EXISTS "requestedById" TEXT;
ALTER TABLE "billing_requests" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "billing_requests_requestedById_idx" ON "billing_requests"("requestedById");

-- One pending manual request per organization
CREATE UNIQUE INDEX IF NOT EXISTS "billing_requests_one_pending_manual"
  ON "billing_requests"("organizationId")
  WHERE "channel" = 'MANUAL' AND "status" = 'AWAITING_REVIEW';

DROP INDEX IF EXISTS "payment_attempts_gatewayCheckoutSessionId_idx";
DROP INDEX IF EXISTS "payment_attempts_billingRequestId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_gatewayCheckoutSessionId_key" ON "payment_attempts"("gatewayCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "payment_attempts_billingRequestId_status_idx" ON "payment_attempts"("billingRequestId", "status");

ALTER TABLE "billing_payments" ADD COLUMN IF NOT EXISTS "billingRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payments_gatewayPaymentId_key" ON "billing_payments"("gatewayPaymentId");
CREATE INDEX IF NOT EXISTS "billing_payments_billingRequestId_idx" ON "billing_payments"("billingRequestId");

DO $$ BEGIN
  ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_billingRequestId_fkey"
    FOREIGN KEY ("billingRequestId") REFERENCES "billing_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
