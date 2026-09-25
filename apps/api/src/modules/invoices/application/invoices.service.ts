import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DocumentSequenceType, Prisma } from '@inventory/database';
import { CreateInvoiceInput, calcInvoiceTotals, roundMoney, resolveInvoicePayment, applyInvoicePayment } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/inventory.service';
import { AuditService } from '../../../common/services/audit.service';
import { assertPdfBuffer, buildReceiptPdf } from './receipt-pdf';

const invoiceDetailInclude = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  contact: true,
  branch: true,
  organization: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      website: true,
      taxId: true,
      logoUrl: true,
      brandColor: true,
      defaultCurrency: true,
    },
  },
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  private async nextInvoiceNumber(tx: Prisma.TransactionClient, orgId: string) {
    const seq = await tx.documentSequence.upsert({
      where: {
        organizationId_type: { organizationId: orgId, type: DocumentSequenceType.INVOICE },
      },
      create: {
        organizationId: orgId,
        type: DocumentSequenceType.INVOICE,
        prefix: 'INV',
        nextValue: 2,
      },
      update: { nextValue: { increment: 1 } },
    });
    const current = seq.nextValue - 1;
    return `${seq.prefix}-${String(current).padStart(6, '0')}`;
  }

  async create(orgId: string, userId: string, input: CreateInvoiceInput, branchId?: string | null) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const currency = input.currency ?? org.defaultCurrency;
    const totals = calcInvoiceTotals({
      items: input.items,
      discount: input.discount,
      taxRate: input.taxRate,
    });

    const paymentStatus = input.paymentStatus ?? 'PAID';
    let paid: { paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID'; paidAmount: number };
    try {
      paid = resolveInvoicePayment(paymentStatus, input.paidAmount, totals.grandTotal);
    } catch {
      throw new BadRequestException('PARTIAL requires paidAmount between 0 and grand total');
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.nextInvoiceNumber(tx, orgId);

      if (input.contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: input.contactId, organizationId: orgId, deletedAt: null },
          select: { id: true },
        });
        if (!contact) throw new BadRequestException('Contact not found');
      }

      const productIds = [
        ...new Set(input.items.map((i) => i.productId).filter((id): id is string => Boolean(id))),
      ];
      if (productIds.length) {
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, organizationId: orgId, deletedAt: null },
          select: { id: true },
        });
        if (products.length !== productIds.length) {
          throw new BadRequestException('One or more products were not found');
        }
      }

      const resolvedBranchId = input.branchId ?? branchId ?? undefined;
      if (!resolvedBranchId) {
        throw new BadRequestException('branchId is required');
      }
      const branch = await tx.branch.findFirst({
        where: { id: resolvedBranchId, organizationId: orgId },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch not found');

      const asQuote = Boolean(input.asQuote);
      const invoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          branchId: resolvedBranchId,
          invoiceNumber,
          contactId: input.contactId ?? undefined,
          status: asQuote ? 'DRAFT' : 'FINALIZED',
          paymentStatus: asQuote ? 'UNPAID' : paid.paymentStatus,
          currency,
          exchangeRate: input.exchangeRate ?? 1,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxRate: input.taxRate ?? 0,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          paidAmount: asQuote ? 0 : paid.paidAmount,
          notes: input.notes ?? undefined,
          finalizedAt: asQuote ? undefined : new Date(),
          createdById: userId,
          updatedById: userId,
          items: {
            create: input.items.map((item, index) => {
              const line = totals.lines[index]!;
              return {
                productId: item.productId ?? undefined,
                name: item.name,
                sku: item.sku ?? undefined,
                barcode: item.barcode ?? undefined,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                costPrice: item.costPrice ?? 0,
                discount: item.discount ?? 0,
                taxRate: item.taxRate ?? 0,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                sortOrder: index,
              };
            }),
          },
        },
        include: { items: true, contact: true },
      });

      if (!asQuote) {
        for (const item of invoice.items) {
          if (!item.productId) continue;
          await this.inventory.saleOut(tx, orgId, userId, {
            productId: item.productId,
            quantity: Number(item.quantity),
            invoiceId: invoice.id,
            branchId: invoice.branchId,
          });
        }

        await this.audit.log({
          organizationId: orgId,
          userId,
          action: 'invoice.finalize',
          entityType: 'Invoice',
          entityId: invoice.id,
          after: { invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal },
        });
      } else {
        await this.audit.log({
          organizationId: orgId,
          userId,
          action: 'invoice.quote',
          entityType: 'Invoice',
          entityId: invoice.id,
          after: { invoiceNumber: invoice.invoiceNumber, status: 'DRAFT' },
        });
      }

      return invoice;
    });
  }

  async list(
    orgId: string,
    query: {
      cursor?: string;
      limit?: number;
      search?: string;
      status?: 'DRAFT' | 'FINALIZED' | 'VOID';
      paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | 'VOID';
    },
  ) {
    const limit = query.limit ?? 50;
    const items = await this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        ...(query.search
          ? {
              OR: [
                { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
                { contact: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        _count: { select: { items: true } },
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id : null };
  }

  async findOne(orgId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: invoiceDetailInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findByReceiptToken(token: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { receiptToken: token },
      include: invoiceDetailInclude,
    });
    if (!invoice || invoice.status === 'VOID') {
      throw new NotFoundException('Receipt not found');
    }
    return invoice;
  }

  async pdfForOrg(orgId: string, id: string) {
    const invoice = await this.findOne(orgId, id);
    const buf = await buildReceiptPdf(invoice);
    assertPdfBuffer(buf);
    return { buf, filename: `${invoice.invoiceNumber}.pdf` };
  }

  async pdfByReceiptToken(token: string) {
    const invoice = await this.findByReceiptToken(token);
    const buf = await buildReceiptPdf(invoice);
    assertPdfBuffer(buf);
    return { buf, filename: `${invoice.invoiceNumber}.pdf` };
  }

  async recordPayment(orgId: string, userId: string, id: string, amount: number) {
    const invoice = await this.findOne(orgId, id);
    if (invoice.status !== 'FINALIZED') {
      throw new BadRequestException('Only finalized invoices accept payments');
    }
    if (invoice.paymentStatus === 'VOID') {
      throw new BadRequestException('Cannot pay a voided invoice');
    }
    const grandTotal = Number(invoice.grandTotal);
    const currentPaid = Number(invoice.paidAmount);
    if (currentPaid >= grandTotal) {
      throw new BadRequestException('Invoice is already paid');
    }
    const next = applyInvoicePayment(currentPaid, amount, grandTotal);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        paidAmount: next.paidAmount,
        paymentStatus: next.paymentStatus,
        updatedById: userId,
      },
      include: { items: true, contact: true },
    });

    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'invoice.payment',
      entityType: 'Invoice',
      entityId: id,
      before: { paidAmount: invoice.paidAmount, paymentStatus: invoice.paymentStatus },
      after: { paidAmount: updated.paidAmount, paymentStatus: updated.paymentStatus, amount },
    });

    return updated;
  }

  async void(orgId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId: orgId },
        include: { items: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'VOID') throw new BadRequestException('Already voided');
      if (invoice.status !== 'FINALIZED') {
        throw new BadRequestException('Only finalized invoices can be voided');
      }

      for (const item of invoice.items) {
        if (!item.productId) continue;
        if (!invoice.branchId) {
          throw new BadRequestException('Invoice has no branch — cannot restore stock');
        }
        const remaining = Number(item.quantity) - Number(item.quantityReturned);
        if (remaining <= 0) continue;
        await this.inventory.saleVoid(tx, orgId, userId, {
          productId: item.productId,
          quantity: remaining,
          invoiceId: invoice.id,
          branchId: invoice.branchId,
          notes: `Void ${invoice.invoiceNumber}`,
        });
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: { quantityReturned: item.quantity },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          status: 'VOID',
          paymentStatus: 'VOID',
          voidedAt: new Date(),
          updatedById: userId,
          // Invalidate public receipt links
          receiptToken: `void_${randomBytes(24).toString('hex')}`,
        },
        include: { items: true, contact: true },
      });
    });
  }

  /** Finalize a DRAFT quote → deducts stock like a normal sale. */
  async finalizeQuote(orgId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId: orgId },
        include: { items: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException('Only draft quotes can be finalized');
      }
      if (!invoice.branchId) {
        throw new BadRequestException('Quote has no branch');
      }

      for (const item of invoice.items) {
        if (!item.productId) continue;
        await this.inventory.saleOut(tx, orgId, userId, {
          productId: item.productId,
          quantity: Number(item.quantity),
          invoiceId: invoice.id,
          branchId: invoice.branchId,
        });
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          updatedById: userId,
        },
        include: { items: true, contact: true },
      });

      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'invoice.finalize',
        entityType: 'Invoice',
        entityId: id,
        after: { from: 'DRAFT' },
      });

      return updated;
    });
  }

  /**
   * Partial or full line returns — restores stock; voids invoice when all lines fully returned.
   */
  async returnInvoice(
    orgId: string,
    userId: string,
    id: string,
    lines?: Array<{ itemId: string; quantity: number }>,
  ) {
    if (!lines?.length) {
      return this.void(orgId, userId, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId: orgId },
        include: { items: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== 'FINALIZED') {
        throw new BadRequestException('Only finalized invoices can be returned');
      }
      if (!invoice.branchId) {
        throw new BadRequestException('Invoice has no branch — cannot restore stock');
      }

      for (const line of lines) {
        const item = invoice.items.find((i) => i.id === line.itemId);
        if (!item) throw new BadRequestException(`Line ${line.itemId} not on invoice`);
        const sold = Number(item.quantity);
        const already = Number(item.quantityReturned);
        const remaining = sold - already;
        if (line.quantity > remaining + 1e-9) {
          throw new BadRequestException(
            `Cannot return ${line.quantity} of ${item.name} — only ${remaining} left`,
          );
        }
        if (item.productId) {
          await this.inventory.saleVoid(tx, orgId, userId, {
            productId: item.productId,
            quantity: line.quantity,
            invoiceId: invoice.id,
            branchId: invoice.branchId,
            notes: `Return ${invoice.invoiceNumber}`,
          });
        }
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: { quantityReturned: already + line.quantity },
        });
      }

      const refreshed = await tx.invoice.findFirstOrThrow({
        where: { id },
        include: { items: true, contact: true },
      });
      const allReturned = refreshed.items.every(
        (i) => Number(i.quantityReturned) >= Number(i.quantity) - 1e-9,
      );
      if (allReturned) {
        return tx.invoice.update({
          where: { id },
          data: {
            status: 'VOID',
            paymentStatus: 'VOID',
            voidedAt: new Date(),
            updatedById: userId,
            receiptToken: `void_${randomBytes(24).toString('hex')}`,
          },
          include: { items: true, contact: true },
        });
      }

      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'invoice.return',
        entityType: 'Invoice',
        entityId: id,
        after: { lines },
      });

      return refreshed;
    });
  }
}
