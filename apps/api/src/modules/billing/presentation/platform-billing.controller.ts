import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingRequestStatus } from '@inventory/database';
import {
  platformBillingReviewSchema,
  type PlatformBillingReviewInput,
} from '@inventory/shared';
import { PlatformAdmin } from '../../../common/decorators/platform-admin.decorator';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BillingService } from '../../billing/application/billing.service';

@ApiTags('platform-billing')
@ApiBearerAuth()
@PlatformAdmin()
@Controller('platform/billing')
export class PlatformBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('requests')
  listRequests(@Query('status') status?: string) {
    const allowed = status && Object.values(BillingRequestStatus).includes(status as BillingRequestStatus)
      ? (status as BillingRequestStatus)
      : undefined;
    return this.billing.listManualRequests(allowed);
  }

  @Patch('requests/:id')
  review(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(platformBillingReviewSchema)) body: PlatformBillingReviewInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.reviewManualRequest(id, user.userId, body);
  }
}
