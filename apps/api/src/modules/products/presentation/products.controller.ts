import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
  type CreateProductInput,
  type UpdateProductInput,
  type ProductListQuery,
} from '@inventory/shared';
import { ProductsService } from '../application/products.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.products.list(user.organizationId, query, user.branchId);
  }

  @Get('by-barcode/:code')
  byBarcode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.products.findByBarcode(user.organizationId, code, user.branchId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.findOne(user.organizationId, id, user.branchId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
  ) {
    return this.products.create(user.organizationId, user.userId, body, user.branchId);
  }

  @Post('backfill-barcodes')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  backfillBarcodes(@CurrentUser() user: AuthUser) {
    return this.products.backfillBarcodes(user.organizationId, user.userId);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.products.update(user.organizationId, user.userId, id, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.softDelete(user.organizationId, user.userId, id);
  }
}
