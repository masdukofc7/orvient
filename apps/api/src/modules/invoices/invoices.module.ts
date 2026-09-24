import { Module } from '@nestjs/common';
import { InvoicesService } from './application/invoices.service';
import { InvoicesController } from './presentation/invoices.controller';
import { ReceiptsController } from './presentation/receipts.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [InvoicesController, ReceiptsController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
