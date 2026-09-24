import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './application/purchase-orders.service';
import { PurchaseOrdersController } from './presentation/purchase-orders.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
