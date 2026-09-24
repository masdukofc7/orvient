import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { InvoicesService } from '../application/invoices.service';

@ApiTags('receipts')
@Public()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    const { buf, filename } = await this.invoices.pdfByReceiptToken(token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  }

  @Get(':token')
  get(@Param('token') token: string) {
    return this.invoices.findByReceiptToken(token);
  }
}
