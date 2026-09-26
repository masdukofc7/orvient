import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createPurchaseOrderSchema,
  purchaseOrderListQuerySchema,
  receivePurchaseOrderSchema,
  type CreatePurchaseOrderInput,
  type PurchaseOrderListQuery,
  type ReceivePurchaseOrderInput,
} from '@inventory/shared';
import { PurchaseOrdersService } from '../application/purchase-orders.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
@RequirePermission('purchase_orders.manage')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(purchaseOrderListQuerySchema)) query: PurchaseOrderListQuery,
  ) {
    return this.purchaseOrders.list(user.organizationId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseOrders.findOne(user.organizationId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderInput,
  ) {
    return this.purchaseOrders.create(user.organizationId, user.userId, body, user.branchId);
  }

  @Post(':id/receive')
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receivePurchaseOrderSchema)) body: ReceivePurchaseOrderInput,
  ) {
    return this.purchaseOrders.receive(user.organizationId, user.userId, id, body);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseOrders.cancel(user.organizationId, user.userId, id);
  }
}
