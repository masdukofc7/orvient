import { BadRequestException, Injectable } from '@nestjs/common';
import { PosQuickSaleInput } from '@inventory/shared';
import { ProductsService } from '../../products/application/products.service';
import { InvoicesService } from '../../invoices/application/invoices.service';

@Injectable()
export class PosService {
  constructor(
    private readonly products: ProductsService,
    private readonly invoices: InvoicesService,
  ) {}

  async quickSale(
    orgId: string,
    userId: string,
    input: PosQuickSaleInput,
    branchId?: string | null,
  ) {
    const items = [];
    for (const line of input.lines) {
      let product;
      if (line.productId) {
        product = await this.products.findOne(orgId, line.productId);
      } else if (line.barcode) {
        product = await this.products.findByBarcode(orgId, line.barcode);
      } else {
        throw new BadRequestException('Each line requires productId or barcode');
      }
      items.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        quantity: line.quantity ?? 1,
        unitPrice: Number(product.sellingPrice),
        costPrice: Number(product.costPrice),
        discount: 0,
        taxRate: 0,
      });
    }

    return this.invoices.create(
      orgId,
      userId,
      {
        contactId: input.contactId,
        currency: input.currency,
        exchangeRate: 1,
        discount: input.discount ?? 0,
        taxRate: input.taxRate ?? 0,
        notes: input.notes,
        paymentStatus: 'PAID',
        asQuote: false,
        items,
      },
      branchId,
    );
  }
}
