import { Module } from '@nestjs/common';
import { PosService } from './application/pos.service';
import { PosController } from './presentation/pos.controller';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [InvoicesModule, ProductsModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
