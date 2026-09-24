import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PlatformService } from './application/platform.service';
import { PlatformController } from './presentation/platform.controller';

@Module({
  imports: [BillingModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
