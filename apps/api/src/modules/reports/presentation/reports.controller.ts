import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { reportRangeSchema } from '@inventory/shared';
import { ReportsService } from '../application/reports.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.reports.dashboard(user.organizationId);
  }

  @Get('sales')
  sales(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(reportRangeSchema)) query: { from?: Date; to?: Date },
  ) {
    return this.reports.sales(user.organizationId, query.from, query.to);
  }

  @Get('inventory')
  inventory(@CurrentUser() user: AuthUser) {
    return this.reports.inventory(user.organizationId);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.reports.lowStock(user.organizationId);
  }

  @Get('products/:productId/history')
  productHistory(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.reports.productHistory(user.organizationId, productId);
  }

  @Get('customers/:contactId/purchases')
  customerPurchases(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string) {
    return this.reports.customerPurchases(user.organizationId, contactId);
  }
}
