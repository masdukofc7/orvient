import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  stockMutationSchema,
  stockOutSchema,
  stockAdjustSchema,
  ledgerQuerySchema,
  type LedgerQuery,
} from '@inventory/shared';
import { z } from 'zod';
import { InventoryService } from './inventory.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

type StockMutation = z.infer<typeof stockMutationSchema>;
type StockOut = z.infer<typeof stockOutSchema>;
type StockAdjust = z.infer<typeof stockAdjustSchema>;

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('stock-in')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  stockIn(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stockMutationSchema)) body: StockMutation,
  ) {
    return this.inventory.stockIn(user.organizationId, user.userId, body, user.branchId);
  }

  @Post('stock-out')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  stockOut(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stockOutSchema)) body: StockOut,
  ) {
    return this.inventory.stockOut(user.organizationId, user.userId, body, user.branchId);
  }

  @Post('adjust')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  adjust(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stockAdjustSchema)) body: StockAdjust,
  ) {
    return this.inventory.adjust(user.organizationId, user.userId, body, user.branchId);
  }

  @Post('transfer')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  transfer(
    @CurrentUser() user: AuthUser,
    @Body(
      new ZodValidationPipe(
        z.object({
          productId: z.string().min(1),
          quantity: z.coerce.number().finite().positive(),
          fromBranchId: z.string().min(1),
          toBranchId: z.string().min(1),
          notes: z.string().trim().max(500).optional().nullable(),
        }),
      ),
    )
    body: {
      productId: string;
      quantity: number;
      fromBranchId: string;
      toBranchId: string;
      notes?: string | null;
    },
  ) {
    return this.inventory.transfer(user.organizationId, user.userId, body);
  }

  @Get('ledger')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  ledger(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQuery,
  ) {
    return this.inventory.ledger(user.organizationId, query);
  }

  @Get('history/:productId')
  history(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.inventory.history(user.organizationId, productId);
  }
}
