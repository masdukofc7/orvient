-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "BillingRequestStatus" AS ENUM ('OPEN', 'CHECKOUT_IN_PROGRESS', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('OPEN', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ABANDONED');
CREATE TYPE "BillingChannel" AS ENUM ('DODO', 'MANUAL');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(19,2) NOT NULL,
    "priceYearly" DECIMAL(19,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "features" JSONB NOT NULL DEFAULT '[]',
    "dodoProductIdMonthly" TEXT,
    "dodoProductIdYearly" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

CREATE TABLE "organization_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "channel" "BillingChannel",
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "gatewayCustomerId" TEXT,
    "gatewaySubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key" ON "organization_subscriptions"("organizationId");
CREATE INDEX "organization_subscriptions_planId_idx" ON "organization_subscriptions"("planId");
CREATE INDEX "organization_subscriptions_status_idx" ON "organization_subscriptions"("status");

CREATE TABLE "billing_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "status" "BillingRequestStatus" NOT NULL DEFAULT 'OPEN',
    "channel" "BillingChannel" NOT NULL,
    "note" TEXT,
    "proofRef" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_requests_organizationId_status_idx" ON "billing_requests"("organizationId", "status");
CREATE INDEX "billing_requests_status_createdAt_idx" ON "billing_requests"("status", "createdAt" DESC);

CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "billingRequestId" TEXT NOT NULL,
    "gatewayProductId" TEXT NOT NULL,
    "gatewayCheckoutSessionId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_attempts_billingRequestId_idx" ON "payment_attempts"("billingRequestId");
CREATE INDEX "payment_attempts_gatewayCheckoutSessionId_idx" ON "payment_attempts"("gatewayCheckoutSessionId");

CREATE TABLE "billing_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "channel" "BillingChannel" NOT NULL,
    "gatewayPaymentId" TEXT,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_payments_organizationId_paidAt_idx" ON "billing_payments"("organizationId", "paidAt" DESC);

CREATE TABLE "dodo_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "webhookId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "dodo_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dodo_webhook_deliveries_type_idx" ON "dodo_webhook_deliveries"("type");

ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_requests" ADD CONSTRAINT "billing_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_requests" ADD CONSTRAINT "billing_requests_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billingRequestId_fkey" FOREIGN KEY ("billingRequestId") REFERENCES "billing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
