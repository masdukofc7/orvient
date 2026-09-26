import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentSequenceType, Prisma } from '@inventory/database';
import {
  CreatePurchaseOrderInput,
  ReceivePurchaseOrderInput,
  calcPurchaseOrderTotals,
  roundMoney,
} from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/inventory.service';
import { AuditService } from '../../../common/services/audit.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  private async nextPoNumber(tx: Prisma.TransactionClient, orgId: string) {
    const seq = await tx.documentSequence.upsert({
      where: {
        organizationId_type: { organizationId: orgId, type: DocumentSequenceType.PURCHASE_ORDER },
      },
      create: {
        organizationId: orgId,
        type: DocumentSequenceType.PURCHASE_ORDER,
        prefix: 'PO',
        nextValue: 2,
      },
      update: { nextValue: { increment: 1 } },
    });
    const current = seq.nextValue - 1;
    return `${seq.prefix}-${String(current).padStart(6, '0')}`;
  }

  async create(
    orgId: string,
    userId: string,
    input: CreatePurchaseOrderInput,
    branchId?: string | null,
  ) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const currency = input.currency ?? org.defaultCurrency;
    const totals = calcPurchaseOrderTotals(input.items);

    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: {
          id: input.contactId,
          organizationId: orgId,
          deletedAt: null,
          type: 'SUPPLIER',
        },
        select: { id: true },
      });
      if (!contact) throw new BadRequestException('Supplier not found');

      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, organizationId: orgId, deletedAt: null },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products were not found');
      }

      const resolvedBranchId = input.branchId ?? branchId ?? undefined;
      if (resolvedBranchId) {
        const branch = await tx.branch.findFirst({
          where: { id: resolvedBranchId, organizationId: orgId },
          select: { id: true },
        });
        if (!branch) throw new BadRequestException('Branch not found');
      }

      const poNumber = await this.nextPoNumber(tx, orgId);
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId: orgId,
          branchId: resolvedBranchId,
          contactId: input.contactId,
          poNumber,
          status: 'ORDERED',
          currency,
          subtotal: totals.subtotal,
          notes: input.notes ?? undefined,
          createdById: userId,
          updatedById: userId,
          items: {
            create: input.items.map((item, index) => ({
              productId: item.productId,
              quantityOrdered: item.quantity,
              unitCost: item.unitCost,
              lineTotal: totals.lines[index]!.lineTotal,
              sortOrder: index,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          contact: true,
        },
      });

      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'purchase_order.create',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        after: { poNumber: po.poNumber, subtotal: po.subtotal },
      });

      return po;
    });
  }

  async list(
    orgId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { poNumber: { contains: query.search, mode: 'insensitive' as const } },
              { contact: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(orgId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        },
        contact: true,
        branch: true,
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async receive(orgId: string, userId: string, id: string, input: ReceivePurchaseOrderInput) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, organizationId: orgId },
        include: { items: true, contact: true },
      });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status === 'CANCELLED') {
        throw new BadRequestException('Cannot receive a cancelled purchase order');
      }
      if (po.status === 'RECEIVED') {
        throw new BadRequestException('Purchase order is already fully received');
      }

      const itemById = new Map(po.items.map((item) => [item.id, item]));
      for (const line of input.items) {
        const item = itemById.get(line.itemId);
        if (!item) throw new BadRequestException(`Line item ${line.itemId} not found on this PO`);
        const ordered = Number(item.quantityOrdered);
        const received = Number(item.quantityReceived);
        const pending = ordered - received;
        if (line.quantity > pending) {
          throw new BadRequestException(
            `Cannot receive ${line.quantity} for ${item.productId}; only ${pending} pending`,
          );
        }
      }

      for (const line of input.items) {
        const item = itemById.get(line.itemId)!;
        const nextReceived = roundMoney(Number(item.quantityReceived) + line.quantity);
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: nextReceived },
        });
        await this.inventory.stockInTx(tx, orgId, userId, {
          productId: item.productId,
          quantity: line.quantity,
          unitCost: Number(item.unitCost),
          branchId: po.branchId,
          referenceType: 'PurchaseOrder',
          referenceId: po.id,
          notes: input.notes ?? `Receive ${po.poNumber}`,
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });
      const fullyReceived = updatedItems.every(
        (item) => Number(item.quantityReceived) >= Number(item.quantityOrdered),
      );
      const anyReceived = updatedItems.some((item) => Number(item.quantityReceived) > 0);

      const updated = await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'ORDERED',
          receivedAt: fullyReceived ? new Date() : po.receivedAt,
          updatedById: userId,
        },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
          },
          contact: true,
        },
      });

      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'purchase_order.receive',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        after: { poNumber: po.poNumber, status: updated.status, items: input.items },
      });

      return updated;
    });
  }

  async cancel(orgId: string, userId: string, id: string) {
    const po = await this.findOne(orgId, id);
    if (po.status === 'CANCELLED') throw new BadRequestException('Already cancelled');
    if (po.status === 'RECEIVED' || po.status === 'PARTIAL') {
      throw new BadRequestException('Cannot cancel a purchase order with received stock');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        updatedById: userId,
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        },
        contact: true,
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'purchase_order.cancel',
      entityType: 'PurchaseOrder',
      entityId: id,
      after: { poNumber: po.poNumber },
    });

    return updated;
  }
}
