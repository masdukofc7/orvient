import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingChannel,
  BillingCycle,
  BillingRequestStatus,
  PaymentAttemptStatus,
  SubscriptionStatus,
  type Plan,
} from '@inventory/database';
import type {
  BillingCheckoutInput,
  BillingCheckoutSyncInput,
  BillingManualRequestInput,
  PlatformBillingReviewInput,
} from '@inventory/shared';
import {
  CHECKOUT_TTL_MINUTES,
  PAST_DUE_GRACE_DAYS,
  TRIAL_DAYS,
} from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { DodoPaymentsService } from '../infrastructure/dodo-payments.service';

const SUCCESS_EVENTS = new Set([
  'payment.succeeded',
  'subscription.active',
  'subscription.renewed',
]);
const FAILURE_EVENTS = new Set([
  'payment.failed',
  'payment.cancelled',
  'subscription.failed',
  'subscription.cancelled',
  'subscription.expired',
]);

export type ActivateSubscriptionInput = {
  organizationId: string;
  planId: string;
  billingCycle: BillingCycle;
  channel: BillingChannel;
  actorId?: string | null;
  billingRequestId?: string | null;
  gatewayPaymentId?: string | null;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  invoiceUrl?: string | null;
  amount?: number | null;
  currency?: string | null;
};

function addBillingPeriod(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from);
  if (cycle === BillingCycle.YEARLY) {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

function planAmount(plan: Plan, cycle: BillingCycle): number {
  return Number(cycle === BillingCycle.YEARLY ? plan.priceYearly : plan.priceMonthly);
}

function normalizeMeta(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function customerId(data: Record<string, unknown>): string | null {
  const c = data.customer;
  if (c && typeof c === 'object' && typeof (c as { customer_id?: string }).customer_id === 'string') {
    return (c as { customer_id: string }).customer_id;
  }
  return typeof data.customer_id === 'string' ? data.customer_id : null;
}

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dodo: DodoPaymentsService,
    private readonly config: ConfigService,
  ) {}

  listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        features: true,
        sortOrder: true,
      },
    });
  }

  async requireActivePlan(planId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  trialDates() {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    return { trialEndsAt, currentPeriodEnd: trialEndsAt };
  }

  /**
   * Persist PAST_DUE when trial/period ended. Shared by tenant + platform reads.
   * Does not touch Organization.status.
   */
  async ensurePastDue<
    T extends {
      id: string;
      status: SubscriptionStatus;
      trialEndsAt: Date | null;
      currentPeriodEnd: Date | null;
      graceEndsAt: Date | null;
    },
  >(sub: T): Promise<T> {
    const now = new Date();
    const expired =
      (sub.status === SubscriptionStatus.TRIALING &&
        sub.trialEndsAt != null &&
        sub.trialEndsAt < now) ||
      (sub.status === SubscriptionStatus.ACTIVE &&
        sub.currentPeriodEnd != null &&
        sub.currentPeriodEnd < now);
    if (!expired) return sub;

    const updated = await this.prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        graceEndsAt:
          sub.graceEndsAt ??
          new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000),
      },
      select: { status: true, graceEndsAt: true },
    });
    return { ...sub, status: updated.status, graceEndsAt: updated.graceEndsAt };
  }

  /**
   * Block product APIs when trial/paid period + grace are exhausted.
   * ponytail: status gate only — plan feature bullets stay marketing until hard caps ship.
   */
  async assertOrgEntitled(organizationId: string) {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      throw new HttpException('No subscription — choose a plan', HttpStatus.PAYMENT_REQUIRED);
    }
    const live = await this.ensurePastDue(sub);
    if (
      live.status === SubscriptionStatus.TRIALING ||
      live.status === SubscriptionStatus.ACTIVE
    ) {
      return;
    }
    if (
      live.status === SubscriptionStatus.PAST_DUE &&
      live.graceEndsAt != null &&
      live.graceEndsAt > new Date()
    ) {
      return;
    }
    throw new HttpException(
      'Subscription expired — update billing to continue',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async getSubscription(organizationId: string) {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const live = await this.ensurePastDue(sub);

    return {
      id: live.id,
      status: live.status,
      billingCycle: live.billingCycle,
      channel: live.channel,
      trialEndsAt: live.trialEndsAt,
      currentPeriodStart: live.currentPeriodStart,
      currentPeriodEnd: live.currentPeriodEnd,
      graceEndsAt: live.graceEndsAt,
      lastPaymentAt: live.lastPaymentAt,
      plan: {
        id: live.plan.id,
        name: live.plan.name,
        slug: live.plan.slug,
        priceMonthly: live.plan.priceMonthly,
        priceYearly: live.plan.priceYearly,
        currency: live.plan.currency,
        features: live.plan.features,
      },
    };
  }

  /** Abandon stale in-flight Dodo checkouts for this org before opening a new one. */
  private async abandonOpenCheckouts(organizationId: string) {
    const open = await this.prisma.billingRequest.findMany({
      where: {
        organizationId,
        channel: BillingChannel.DODO,
        status: BillingRequestStatus.CHECKOUT_IN_PROGRESS,
      },
      select: { id: true },
    });
    if (!open.length) return;
    const ids = open.map((r) => r.id);
    await this.prisma.paymentAttempt.updateMany({
      where: { billingRequestId: { in: ids }, status: PaymentAttemptStatus.OPEN },
      data: {
        status: PaymentAttemptStatus.ABANDONED,
        reason: 'Superseded by a new checkout',
        endedAt: new Date(),
      },
    });
    await this.prisma.billingRequest.updateMany({
      where: { id: { in: ids } },
      data: { status: BillingRequestStatus.EXPIRED },
    });
  }

  async createCheckout(
    organizationId: string,
    user: { userId: string; email: string },
    input: BillingCheckoutInput,
  ) {
    if (!this.dodo.isConfigured()) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const plan = await this.requireActivePlan(input.planId);
    const cycle = input.billingCycle as BillingCycle;
    const productId = this.dodo.resolveProductId(plan, cycle);
    const amount = planAmount(plan, cycle);
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MINUTES * 60_000);

    await this.abandonOpenCheckouts(organizationId);

    const request = await this.prisma.billingRequest.create({
      data: {
        organizationId,
        planId: plan.id,
        billingCycle: cycle,
        status: BillingRequestStatus.CHECKOUT_IN_PROGRESS,
        channel: BillingChannel.DODO,
        amount,
        currency: plan.currency,
        requestedById: user.userId,
        expiresAt,
      },
    });
    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        billingRequestId: request.id,
        gatewayProductId: productId,
        status: PaymentAttemptStatus.OPEN,
      },
    });

    const appUrl = (
      this.config.get<string>('APP_URL') ||
      this.config.get<string>('CORS_ORIGIN') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const returnUrl =
      input.returnUrl ??
      `${appUrl}/settings/billing?checkout=success&request_id=${request.id}&attempt_id=${attempt.id}`;
    const cancelUrl =
      input.cancelUrl ??
      `${appUrl}/settings/billing?checkout=cancelled&request_id=${request.id}&attempt_id=${attempt.id}`;

    try {
      const session = await this.dodo.createCheckoutSession({
        productId,
        customerEmail: user.email,
        customerName: user.email,
        returnUrl,
        cancelUrl,
        metadata: {
          organizationId,
          billingRequestId: request.id,
          paymentAttemptId: attempt.id,
          planId: plan.id,
          billingCycle: cycle,
          source: 'orvient_billing',
        },
      });

      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { gatewayCheckoutSessionId: session.session_id },
      });

      return {
        checkoutUrl: session.checkout_url,
        sessionId: session.session_id,
        requestId: request.id,
        attemptId: attempt.id,
        expiresAt,
      };
    } catch (err) {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          reason: 'Could not start payment session',
          endedAt: new Date(),
        },
      });
      await this.prisma.billingRequest.update({
        where: { id: request.id },
        data: { status: BillingRequestStatus.EXPIRED },
      });
      throw err;
    }
  }

  /**
   * Return-URL safety net: if webhook is slow/missed, retrieve Dodo session and activate when paid.
   */
  async syncCheckout(organizationId: string, input: BillingCheckoutSyncInput) {
    const request = await this.prisma.billingRequest.findFirst({
      where: { id: input.requestId, organizationId },
      include: { attempts: { orderBy: { startedAt: 'desc' } }, plan: true },
    });
    if (!request) throw new NotFoundException('Checkout request not found');

    if (request.status === BillingRequestStatus.APPROVED) {
      return { status: 'already_active' as const, subscription: await this.getSubscription(organizationId) };
    }

    if (
      request.status === BillingRequestStatus.EXPIRED ||
      request.status === BillingRequestStatus.REJECTED
    ) {
      throw new BadRequestException('Checkout is no longer active');
    }

    if (request.expiresAt && request.expiresAt < new Date()) {
      await this.prisma.billingRequest.update({
        where: { id: request.id },
        data: { status: BillingRequestStatus.EXPIRED },
      });
      await this.prisma.paymentAttempt.updateMany({
        where: { billingRequestId: request.id, status: PaymentAttemptStatus.OPEN },
        data: {
          status: PaymentAttemptStatus.ABANDONED,
          reason: 'Checkout expired',
          endedAt: new Date(),
        },
      });
      throw new BadRequestException('Checkout expired');
    }

    const attempt =
      (input.attemptId
        ? request.attempts.find((a) => a.id === input.attemptId)
        : null) ??
      request.attempts.find((a) => a.status === PaymentAttemptStatus.OPEN) ??
      request.attempts[0];

    if (!attempt) throw new NotFoundException('Payment attempt not found');

    if (attempt.status === PaymentAttemptStatus.SUCCEEDED) {
      return { status: 'paid' as const, subscription: await this.getSubscription(organizationId) };
    }

    const sessionId = input.sessionId || attempt.gatewayCheckoutSessionId;
    if (sessionId && this.dodo.isConfigured()) {
      try {
        const session = await this.dodo.retrieveCheckoutSession(sessionId);
        if (session.payment_status === 'succeeded' && session.payment_id) {
          await this.activateSubscription({
            organizationId,
            planId: request.planId,
            billingCycle: request.billingCycle,
            channel: BillingChannel.DODO,
            billingRequestId: request.id,
            gatewayPaymentId: session.payment_id,
            amount: request.amount != null ? Number(request.amount) : null,
            currency: request.currency,
          });
          return { status: 'paid' as const, subscription: await this.getSubscription(organizationId) };
        }
        if (
          session.payment_status === 'failed' ||
          session.payment_status === 'cancelled'
        ) {
          await this.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status:
                session.payment_status === 'cancelled'
                  ? PaymentAttemptStatus.CANCELLED
                  : PaymentAttemptStatus.FAILED,
              reason: `Dodo session: ${session.payment_status}`,
              endedAt: new Date(),
            },
          });
          await this.prisma.billingRequest.update({
            where: { id: request.id },
            data: { status: BillingRequestStatus.EXPIRED },
          });
          return { status: 'failed' as const, paymentStatus: session.payment_status };
        }
      } catch (err) {
        this.log.warn(
          `Checkout sync retrieve failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      status: 'pending' as const,
      requestId: request.id,
      attemptId: attempt.id,
      sessionId: attempt.gatewayCheckoutSessionId,
    };
  }

  async createManualRequest(
    organizationId: string,
    userId: string,
    input: BillingManualRequestInput,
  ) {
    const plan = await this.requireActivePlan(input.planId);
    const cycle = input.billingCycle as BillingCycle;
    const amount = planAmount(plan, cycle);

    try {
      return await this.prisma.billingRequest.create({
        data: {
          organizationId,
          planId: plan.id,
          billingCycle: cycle,
          status: BillingRequestStatus.AWAITING_REVIEW,
          channel: BillingChannel.MANUAL,
          amount,
          currency: plan.currency,
          method: input.method,
          note: input.note,
          proofRef: input.proofRef,
          requestedById: userId,
        },
      });
    } catch (err) {
      // Unique partial index: one pending manual request per org
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('A manual payment request is already pending');
      }
      throw err;
    }
  }

  async listManualRequests(status?: BillingRequestStatus) {
    return this.prisma.billingRequest.findMany({
      where: {
        channel: BillingChannel.MANUAL,
        ...(status ? { status } : { status: BillingRequestStatus.AWAITING_REVIEW }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        plan: { select: { id: true, name: true, slug: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async reviewManualRequest(
    requestId: string,
    actorId: string,
    input: PlatformBillingReviewInput,
  ) {
    const req = await this.prisma.billingRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.channel !== BillingChannel.MANUAL) {
      throw new BadRequestException('Not a manual payment request');
    }
    if (req.status === BillingRequestStatus.APPROVED) {
      return this.getSubscription(req.organizationId);
    }
    if (req.status !== BillingRequestStatus.AWAITING_REVIEW) {
      throw new BadRequestException('Request is not awaiting review');
    }

    if (input.status === 'REJECTED') {
      const updated = await this.prisma.billingRequest.update({
        where: { id: requestId },
        data: {
          status: BillingRequestStatus.REJECTED,
          reviewedById: actorId,
          reviewedAt: new Date(),
          rejectReason: input.rejectReason ?? 'Rejected',
        },
      });
      await this.audit.log({
        organizationId: req.organizationId,
        userId: actorId,
        action: 'billing.request.reject',
        entityType: 'BillingRequest',
        entityId: requestId,
        after: { rejectReason: input.rejectReason },
      });
      return updated;
    }

    return this.activateSubscription({
      organizationId: req.organizationId,
      planId: req.planId,
      billingCycle: req.billingCycle,
      channel: BillingChannel.MANUAL,
      actorId,
      billingRequestId: req.id,
      amount: req.amount != null ? Number(req.amount) : null,
      currency: req.currency,
    });
  }

  async activateSubscription(input: ActivateSubscriptionInput) {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    // Idempotent: same gateway payment must not double-extend
    if (input.gatewayPaymentId) {
      const existing = await this.prisma.billingPayment.findUnique({
        where: { gatewayPaymentId: input.gatewayPaymentId },
      });
      if (existing) {
        return this.prisma.organizationSubscription.findUniqueOrThrow({
          where: { organizationId: input.organizationId },
        });
      }
    }

    const now = new Date();
    const currentPeriodEnd = addBillingPeriod(now, input.billingCycle);
    const amount = input.amount ?? planAmount(plan, input.billingCycle);

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (input.billingRequestId) {
          const locked = await tx.billingRequest.findUnique({
            where: { id: input.billingRequestId },
          });
          if (!locked) throw new NotFoundException('Billing request not found');
          if (locked.status === BillingRequestStatus.APPROVED) {
            return tx.organizationSubscription.findUniqueOrThrow({
              where: { organizationId: input.organizationId },
            });
          }
          if (
            locked.status !== BillingRequestStatus.AWAITING_REVIEW &&
            locked.status !== BillingRequestStatus.CHECKOUT_IN_PROGRESS &&
            locked.status !== BillingRequestStatus.OPEN
          ) {
            throw new BadRequestException('Billing request cannot be activated');
          }
          if (locked.organizationId !== input.organizationId) {
            throw new BadRequestException('Billing request organization mismatch');
          }
        }

        const sub = await tx.organizationSubscription.upsert({
          where: { organizationId: input.organizationId },
          create: {
            organizationId: input.organizationId,
            planId: input.planId,
            status: SubscriptionStatus.ACTIVE,
            billingCycle: input.billingCycle,
            channel: input.channel,
            currentPeriodStart: now,
            currentPeriodEnd,
            lastPaymentAt: now,
            trialEndsAt: null,
            graceEndsAt: null,
            gatewayCustomerId: input.gatewayCustomerId ?? undefined,
            gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
          },
          update: {
            planId: input.planId,
            status: SubscriptionStatus.ACTIVE,
            billingCycle: input.billingCycle,
            channel: input.channel,
            currentPeriodStart: now,
            currentPeriodEnd,
            lastPaymentAt: now,
            trialEndsAt: null,
            graceEndsAt: null,
            gatewayCustomerId: input.gatewayCustomerId ?? undefined,
            gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
          },
        });

        if (input.billingRequestId) {
          await tx.billingRequest.update({
            where: { id: input.billingRequestId },
            data: {
              status: BillingRequestStatus.APPROVED,
              reviewedById: input.actorId ?? undefined,
              reviewedAt: now,
            },
          });
          await tx.paymentAttempt.updateMany({
            where: {
              billingRequestId: input.billingRequestId,
              status: PaymentAttemptStatus.OPEN,
            },
            data: { status: PaymentAttemptStatus.SUCCEEDED, endedAt: now },
          });
        }

        await tx.billingPayment.create({
          data: {
            organizationId: input.organizationId,
            planId: input.planId,
            billingRequestId: input.billingRequestId ?? undefined,
            amount,
            currency: input.currency ?? plan.currency,
            channel: input.channel,
            gatewayPaymentId: input.gatewayPaymentId || undefined,
            invoiceUrl: input.invoiceUrl ?? undefined,
            paidAt: now,
          },
        });

        return sub;
      });
    } catch (err) {
      // Concurrent webhook + sync both saw no payment row — unique gatewayPaymentId wins
      if (
        input.gatewayPaymentId &&
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return this.prisma.organizationSubscription.findUniqueOrThrow({
          where: { organizationId: input.organizationId },
        });
      }
      throw err;
    }

    await this.audit.log({
      organizationId: input.organizationId,
      userId: input.actorId,
      action: 'billing.subscription.activate',
      entityType: 'OrganizationSubscription',
      entityId: result.id,
      after: {
        planId: input.planId,
        channel: input.channel,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd,
        gatewayPaymentId: input.gatewayPaymentId,
      },
    });

    return result;
  }

  async handleDodoWebhook(headers: Record<string, string>, rawBody: Buffer | string) {
    const client = this.dodo.webhookClient();
    const event = client.webhooks.unwrap(String(rawBody), {
      headers: {
        'webhook-id': headers['webhook-id'] || '',
        'webhook-signature': headers['webhook-signature'] || '',
        'webhook-timestamp': headers['webhook-timestamp'] || '',
      },
    }) as unknown as { type: string; data?: Record<string, unknown>; id?: string };

    const dedupId = String(
      headers['webhook-id'] ||
        event.id ||
        `${event.type}-${JSON.stringify(event.data ?? {}).slice(0, 80)}`,
    );

    const existing = await this.prisma.dodoWebhookDelivery.findUnique({ where: { id: dedupId } });
    if (existing?.status === 'processed') return { ok: true, duplicate: true };

    await this.prisma.dodoWebhookDelivery.upsert({
      where: { id: dedupId },
      create: {
        id: dedupId,
        type: event.type,
        status: 'processing',
        webhookId: headers['webhook-id'] || null,
      },
      update: { status: 'processing', type: event.type },
    });

    try {
      const data = event.data ?? {};
      const meta = normalizeMeta(data.metadata);
      const organizationId = meta.organizationId;
      const billingRequestId = meta.billingRequestId;
      const planId = meta.planId;
      const billingCycle = (meta.billingCycle as BillingCycle) || BillingCycle.MONTHLY;
      const attemptId = meta.paymentAttemptId;

      if (FAILURE_EVENTS.has(event.type) && billingRequestId) {
        await this.prisma.paymentAttempt.updateMany({
          where: {
            ...(attemptId ? { id: attemptId } : { billingRequestId }),
            status: PaymentAttemptStatus.OPEN,
          },
          data: {
            status: PaymentAttemptStatus.FAILED,
            reason: `Dodo: ${event.type}`,
            endedAt: new Date(),
          },
        });
        await this.prisma.billingRequest.updateMany({
          where: {
            id: billingRequestId,
            status: BillingRequestStatus.CHECKOUT_IN_PROGRESS,
          },
          data: { status: BillingRequestStatus.EXPIRED },
        });
      } else if (SUCCESS_EVENTS.has(event.type) && organizationId && planId) {
        const paymentId = String(
          data.payment_id ?? (event.type.startsWith('payment') ? data.id : '') ?? '',
        );
        await this.activateSubscription({
          organizationId,
          planId,
          billingCycle,
          channel: BillingChannel.DODO,
          billingRequestId: billingRequestId || null,
          gatewayPaymentId: paymentId || null,
          gatewayCustomerId: customerId(data),
          gatewaySubscriptionId:
            typeof data.subscription_id === 'string'
              ? data.subscription_id
              : event.type.startsWith('subscription') && typeof data.id === 'string'
                ? data.id
                : null,
          invoiceUrl: typeof data.invoice_url === 'string' ? data.invoice_url : null,
          amount:
            typeof data.total_amount === 'number'
              ? data.total_amount / 100
              : typeof data.settlement_amount === 'number'
                ? data.settlement_amount / 100
                : null,
          currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : null,
        });
      } else {
        this.log.debug(`Ignoring Dodo event ${event.type}`);
      }

      await this.prisma.dodoWebhookDelivery.update({
        where: { id: dedupId },
        data: { status: 'processed', processedAt: new Date() },
      });
      return { ok: true };
    } catch (err) {
      await this.prisma.dodoWebhookDelivery.update({
        where: { id: dedupId },
        data: { status: 'failed', processedAt: new Date() },
      });
      throw err;
    }
  }
}
