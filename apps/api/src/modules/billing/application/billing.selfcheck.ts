/**
 * ponytail: billing trial, manual approve/reject, ownership, idempotent activate.
 * Run: pnpm --filter @inventory/api exec tsx src/modules/billing/application/billing.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ConflictException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  MembershipRole,
  OrganizationStatus,
  SubscriptionStatus,
  BillingCycle,
  BillingChannel,
  BillingRequestStatus,
} from '@inventory/database';
import { TRIAL_DAYS } from '@inventory/shared';
import { BillingService } from './billing.service';
import { AuditService } from '../../../common/services/audit.service';
import { DodoPaymentsService } from '../infrastructure/dodo-payments.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

async function selfcheck() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const suffix = randomBytes(3).toString('hex');
  const email = `bill-${suffix}@orvient.test`;
  const hash = await argon2.hash('Selfcheck1!', { type: argon2.argon2id });

  const plan = await prisma.plan.findFirst({ where: { isActive: true } });
  assert.ok(plan, 'seed at least one plan');

  const audit = new AuditService(prisma);
  const config = new ConfigService({});
  const dodo = new DodoPaymentsService(config);
  const billing = new BillingService(prisma, audit, dodo, config);

  try {
    const user = await prisma.user.create({
      data: { email, name: 'Bill', passwordHash: hash },
    });
    const org = await prisma.organization.create({
      data: {
        name: `Bill Org ${suffix}`,
        slug: `bill-org-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Org ${suffix}`,
        slug: `other-org-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, organizationId: org.id, role: MembershipRole.OWNER },
    });
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000);
    await prisma.organizationSubscription.create({
      data: {
        organizationId: org.id,
        planId: plan!.id,
        status: SubscriptionStatus.TRIALING,
        billingCycle: BillingCycle.MONTHLY,
        trialEndsAt,
        currentPeriodStart: trialStartedAt,
        currentPeriodEnd: trialEndsAt,
      },
    });

    const sub = await billing.getSubscription(org.id);
    assert.equal(sub.status, SubscriptionStatus.TRIALING);
    assert.ok(sub.currentPeriodStart);

    // Expired trial → PAST_DUE (org stays ACTIVE); shared ensurePastDue path
    await prisma.organizationSubscription.update({
      where: { organizationId: org.id },
      data: {
        trialEndsAt: new Date(Date.now() - 60_000),
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    });
    const pastDue = await billing.getSubscription(org.id);
    assert.equal(pastDue.status, SubscriptionStatus.PAST_DUE);
    assert.ok(pastDue.graceEndsAt);
    const orgStill = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    assert.equal(orgStill.status, OrganizationStatus.ACTIVE);

    // Grace window still allows access
    await assert.doesNotReject(() => billing.assertOrgEntitled(org.id));

    // Past grace → blocked
    await prisma.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { graceEndsAt: new Date(Date.now() - 60_000) },
    });
    await assert.rejects(
      () => billing.assertOrgEntitled(org.id),
      (err: unknown) =>
        err instanceof HttpException && err.getStatus() === HttpStatus.PAYMENT_REQUIRED,
    );

    // Restore trial for the rest of the flow
    await prisma.organizationSubscription.update({
      where: { organizationId: org.id },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
        graceEndsAt: null,
      },
    });
    await assert.doesNotReject(() => billing.assertOrgEntitled(org.id));

    const req = await billing.createManualRequest(org.id, user.id, {
      planId: plan!.id,
      billingCycle: 'MONTHLY',
      method: 'bKash',
      proofRef: `trx-${suffix}`,
      note: 'paid via bKash selfcheck',
    });
    assert.equal(req.status, BillingRequestStatus.AWAITING_REVIEW);
    assert.ok(req.amount != null);
    assert.equal(req.requestedById, user.id);
    assert.equal(req.method, 'bKash');

    await assert.rejects(
      () =>
        billing.createManualRequest(org.id, user.id, {
          planId: plan!.id,
          billingCycle: 'MONTHLY',
          method: 'bank',
          proofRef: `trx-dup-${suffix}`,
        }),
      (err: unknown) => err instanceof ConflictException,
    );

    // Cross-org sync must not leak another tenant's checkout
    await assert.rejects(
      () => billing.syncCheckout(otherOrg.id, { requestId: req.id }),
      (err: unknown) => err instanceof NotFoundException,
    );

    await billing.reviewManualRequest(req.id, user.id, {
      status: 'REJECTED',
      rejectReason: 'bad proof',
    });
    const stillTrial = await billing.getSubscription(org.id);
    assert.equal(stillTrial.status, SubscriptionStatus.TRIALING);

    const req2 = await billing.createManualRequest(org.id, user.id, {
      planId: plan!.id,
      billingCycle: 'MONTHLY',
      method: 'bank transfer',
      proofRef: `trx2-${suffix}`,
      note: 'second attempt',
    });
    await billing.reviewManualRequest(req2.id, user.id, { status: 'APPROVED' });
    const active = await billing.getSubscription(org.id);
    assert.equal(active.status, SubscriptionStatus.ACTIVE);
    assert.equal(active.channel, BillingChannel.MANUAL);
    assert.ok(active.currentPeriodEnd);
    assert.ok(active.currentPeriodStart);

    // Idempotent gateway payment
    await billing.activateSubscription({
      organizationId: org.id,
      planId: plan!.id,
      billingCycle: BillingCycle.MONTHLY,
      channel: BillingChannel.DODO,
      gatewayPaymentId: `pay_${suffix}`,
    });
    await billing.activateSubscription({
      organizationId: org.id,
      planId: plan!.id,
      billingCycle: BillingCycle.MONTHLY,
      channel: BillingChannel.DODO,
      gatewayPaymentId: `pay_${suffix}`,
    });
    const payments = await prisma.billingPayment.count({
      where: { gatewayPaymentId: `pay_${suffix}` },
    });
    assert.equal(payments, 1);

    console.log('billing.selfcheck ok');
  } finally {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [`bill-org-${suffix}`, `other-org-${suffix}`] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length) {
      await prisma.billingPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.paymentAttempt.deleteMany({
        where: { billingRequest: { organizationId: { in: orgIds } } },
      });
      await prisma.billingRequest.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationSubscription.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
}

void selfcheck();
