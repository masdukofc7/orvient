import { Module } from '@nestjs/common';
import { BillingService } from './application/billing.service';
import { DodoPaymentsService } from './infrastructure/dodo-payments.service';
import { BillingController } from './presentation/billing.controller';
import { PlatformBillingController } from './presentation/platform-billing.controller';

@Module({
  controllers: [BillingController, PlatformBillingController],
  providers: [BillingService, DodoPaymentsService],
  exports: [BillingService],
})
export class BillingModule {}
