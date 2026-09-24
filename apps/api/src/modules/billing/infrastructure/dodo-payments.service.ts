import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DodoPayments from 'dodopayments';
import { BillingCycle, type Plan } from '@inventory/database';

type DodoEnvironment = 'test_mode' | 'live_mode';

@Injectable()
export class DodoPaymentsService {
  private readonly log = new Logger(DodoPaymentsService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('DODO_PAYMENTS_API_KEY')?.trim());
  }

  client(): DodoPayments {
    const bearerToken = this.config.get<string>('DODO_PAYMENTS_API_KEY')?.trim();
    if (!bearerToken) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const environment =
      (this.config.get<string>('DODO_PAYMENTS_ENVIRONMENT') as DodoEnvironment) || 'test_mode';
    return new DodoPayments({ bearerToken, environment });
  }

  webhookClient(): DodoPayments {
    const bearerToken = this.config.get<string>('DODO_PAYMENTS_API_KEY')?.trim();
    const webhookKey = this.config.get<string>('DODO_PAYMENTS_WEBHOOK_KEY')?.trim();
    if (!webhookKey) {
      throw new ServiceUnavailableException('Webhook key is not configured');
    }
    const environment =
      (this.config.get<string>('DODO_PAYMENTS_ENVIRONMENT') as DodoEnvironment) || 'test_mode';
    return new DodoPayments({
      bearerToken: bearerToken || undefined,
      environment,
      webhookKey,
    });
  }

  resolveProductId(plan: Plan, cycle: BillingCycle): string {
    const env = this.config.get<string>('DODO_PAYMENTS_ENVIRONMENT') || 'test_mode';
    if (env === 'test_mode') {
      const testId = this.config.get<string>('DODO_TEST_PRODUCT_ID')?.trim();
      if (testId) return testId;
    }
    const id =
      cycle === BillingCycle.YEARLY ? plan.dodoProductIdYearly : plan.dodoProductIdMonthly;
    if (!id?.trim()) {
      throw new ServiceUnavailableException(
        `Plan "${plan.slug}" has no Dodo product id for ${cycle.toLowerCase()}`,
      );
    }
    return id.trim();
  }

  async createCheckoutSession(input: {
    productId: string;
    customerEmail: string;
    customerName: string;
    returnUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }) {
    const dodo = this.client();
    try {
      const session = await dodo.checkoutSessions.create({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        customer: { email: input.customerEmail, name: input.customerName },
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
        feature_flags: { redirect_immediately: true },
      });
      if (!session.checkout_url) throw new Error('Dodo did not return checkout_url');
      return session;
    } catch (err) {
      this.log.error(`Dodo checkout failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('Payment service temporarily unavailable');
    }
  }

  retrieveCheckoutSession(sessionId: string) {
    return this.client().checkoutSessions.retrieve(sessionId);
  }
}
