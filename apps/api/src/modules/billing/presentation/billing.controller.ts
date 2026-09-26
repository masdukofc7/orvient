import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  billingCheckoutSchema,
  billingCheckoutSyncSchema,
  billingManualRequestSchema,
  type BillingCheckoutInput,
  type BillingCheckoutSyncInput,
  type BillingManualRequestInput,
} from '@inventory/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermission } from '../../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BillingService } from '../application/billing.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @ApiBearerAuth()
  @Get('subscription')
  getSubscription(@CurrentUser() user: AuthUser) {
    return this.billing.getSubscription(user.organizationId);
  }

  @ApiBearerAuth()
  @RequirePermission('billing.manage')
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(billingCheckoutSchema)) body: BillingCheckoutInput,
  ) {
    return this.billing.createCheckout(
      user.organizationId,
      { userId: user.userId, email: user.email },
      body,
    );
  }

  @ApiBearerAuth()
  @RequirePermission('billing.manage')
  @Post('checkout/sync')
  syncCheckout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(billingCheckoutSyncSchema)) body: BillingCheckoutSyncInput,
  ) {
    return this.billing.syncCheckout(user.organizationId, body);
  }

  @ApiBearerAuth()
  @RequirePermission('billing.manage')
  @Post('manual-request')
  manualRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(billingManualRequestSchema)) body: BillingManualRequestInput,
  ) {
    return this.billing.createManualRequest(user.organizationId, user.userId, body);
  }

  @Public()
  @Post('webhooks/dodo')
  async dodoWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>,
  ) {
    const raw =
      req.rawBody?.toString('utf8') ||
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    try {
      return await this.billing.handleDodoWebhook(
        {
          'webhook-id': headers['webhook-id'] || '',
          'webhook-signature': headers['webhook-signature'] || '',
          'webhook-timestamp': headers['webhook-timestamp'] || '',
        },
        raw,
      );
    } catch (err) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Invalid webhook signature',
      );
    }
  }
}
