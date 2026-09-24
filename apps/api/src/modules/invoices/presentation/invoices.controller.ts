import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createInvoiceSchema,
  invoiceListQuerySchema,
  recordPaymentSchema,
  type CreateInvoiceInput,
  type InvoiceListQuery,
  type RecordPaymentInput,
} from '@inventory/shared';
import { InvoicesService } from '../application/invoices.service';
import { CurrentUser, AuthUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ) {
    return this.invoices.list(user.organizationId, query);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buf, filename } = await this.invoices.pdfForOrg(user.organizationId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.findOne(user.organizationId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
  ) {
    return this.invoices.create(user.organizationId, user.userId, body, user.branchId);
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.invoices.recordPayment(user.organizationId, user.userId, id, body.amount);
  }

  @Post(':id/void')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  void(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.void(user.organizationId, user.userId, id);
  }

  @Post(':id/finalize')
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER')
  finalize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.finalizeQuote(user.organizationId, user.userId, id);
  }

  @Post(':id/return')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  returnSale(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.returnInvoice(user.organizationId, user.userId, id);
  }
}
