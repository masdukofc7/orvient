import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { posQuickSaleSchema, type PosQuickSaleInput } from '@inventory/shared';
import { PosService } from '../application/pos.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Post('quick-sale')
  quickSale(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(posQuickSaleSchema)) body: PosQuickSaleInput,
  ) {
    return this.pos.quickSale(user.organizationId, user.userId, body, user.branchId);
  }
}
