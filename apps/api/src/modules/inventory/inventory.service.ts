import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnType, Prisma } from '@inventory/database';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../../common/services/audit.service';
import { EmailService } from '../../infrastructure/email/email.module';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private async requireBranch(
    tx: Prisma.TransactionClient,
    orgId: string,
    branchId: string,
  ) {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, organizationId: orgId },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Branch not found');
    return branch.id;
  }

  private async mutateStock(params: {
    orgId: string;
    userId: string;
    productId: string;
    delta: number;
    type: InventoryTxnType;
    branchId: string;
    notes?: string | null;
    unitCost?: number | null;
    referenceType?: string | null;
    referenceId?: string | null;
    invoiceId?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    const run = async (tx: Prisma.TransactionClient) => {
      const branchId = await this.requireBranch(tx, params.orgId, params.branchId);

      const product = await tx.product.findFirst({
        where: {
          id: params.productId,
          organizationId: params.orgId,
          deletedAt: null,
        },
      });
      if (!product) throw new NotFoundException('Product not found');

      await tx.branchStock.upsert({
        where: {
          productId_branchId: { productId: product.id, branchId },
        },
        create: { productId: product.id, branchId, quantity: 0 },
        update: {},
      });

      const row = await tx.branchStock.findUniqueOrThrow({
        where: { productId_branchId: { productId: product.id, branchId } },
      });

      const before = Number(row.quantity);
      const after = before + params.delta;
      if (after < 0) {
        throw new BadRequestException('Insufficient stock at this branch');
      }

      const locked = await tx.branchStock.updateMany({
        where: {
          productId: product.id,
          branchId,
          quantity: row.quantity,
        },
        data: { quantity: after },
      });
      if (locked.count !== 1) {
        throw new BadRequestException('Stock changed concurrently — retry');
      }

      const total = await tx.branchStock.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true },
      });
      const orgTotal = Number(total._sum.quantity ?? 0);
      await tx.product.update({
        where: { id: product.id },
        data: { stock: orgTotal, updatedById: params.userId },
      });
      const updated = await tx.product.findUniqueOrThrow({ where: { id: product.id } });

      const txn = await tx.inventoryTransaction.create({
        data: {
          organizationId: params.orgId,
          branchId,
          productId: product.id,
          type: params.type,
          quantity: params.delta,
          quantityBefore: before,
          quantityAfter: after,
          unitCost: params.unitCost ?? undefined,
          referenceType: params.referenceType ?? undefined,
          referenceId: params.referenceId ?? undefined,
          invoiceId: params.invoiceId ?? undefined,
          notes: params.notes ?? undefined,
          createdById: params.userId,
        },
      });

      return { product: updated, txn, branchQuantity: after };
    };

    const result = params.tx ? await run(params.tx) : await this.prisma.$transaction(run);

    if (result.product.barcode) {
      await this.redis
        .del(`product:barcode:${params.orgId}:${result.product.barcode}`)
        .catch(() => undefined);
    }

    await this.audit.log({
      organizationId: params.orgId,
      userId: params.userId,
      action: `inventory.${params.type.toLowerCase()}`,
      entityType: 'InventoryTransaction',
      entityId: result.txn.id,
      after: result.txn,
    });

    const lowAt = Number(result.product.lowStockAt);
    const afterTotal = Number(result.product.stock);
    if (params.delta < 0 && afterTotal <= lowAt) {
      void this.notifyLowStockOnce(params.orgId, result.product);
    }

    return result;
  }

  private async notifyLowStockOnce(
    orgId: string,
    product: { id: string; name: string; sku: string; stock: unknown; lowStockAt: unknown },
  ) {
    const key = `lowstock:mail:${orgId}:${product.id}`;
    const existing = await this.redis.get(key).catch(() => null);
    if (existing) return;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, email: true },
    });
    if (!org?.email) return;
    try {
      await this.email.sendLowStock(org.email, org.name, [
        {
          name: product.name,
          sku: product.sku,
          stock: Number(product.stock),
          lowStockAt: Number(product.lowStockAt),
        },
      ]);
      await this.redis.set(key, '1', 86_400).catch(() => undefined);
    } catch {
      // email optional — don't fail stock mutation
    }
  }

  private resolveBranchId(branchId?: string | null) {
    if (!branchId?.trim()) {
      throw new BadRequestException('branchId is required');
    }
    return branchId;
  }

  async stockIn(
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      notes?: string | null;
      unitCost?: number | null;
      branchId?: string | null;
      contactId?: string | null;
    },
    fallbackBranchId?: string | null,
  ) {
    let referenceType: string | null = null;
    let referenceId: string | null = null;
    if (input.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          id: input.contactId,
          organizationId: orgId,
          deletedAt: null,
          type: 'SUPPLIER',
        },
        select: { id: true },
      });
      if (!contact) throw new BadRequestException('Supplier not found');
      referenceType = 'Contact';
      referenceId = contact.id;
    }

    return this.mutateStock({
      orgId,
      userId,
      productId: input.productId,
      delta: input.quantity,
      type: 'STOCK_IN',
      notes: input.notes,
      unitCost: input.unitCost,
      branchId: this.resolveBranchId(input.branchId ?? fallbackBranchId),
      referenceType,
      referenceId,
    });
  }

  stockOut(
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      notes?: string | null;
      branchId?: string | null;
    },
    fallbackBranchId?: string | null,
  ) {
    return this.mutateStock({
      orgId,
      userId,
      productId: input.productId,
      delta: -Math.abs(input.quantity),
      type: 'STOCK_OUT',
      notes: input.notes,
      branchId: this.resolveBranchId(input.branchId ?? fallbackBranchId),
    });
  }

  adjust(
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      notes?: string | null;
      branchId?: string | null;
    },
    fallbackBranchId?: string | null,
  ) {
    return this.mutateStock({
      orgId,
      userId,
      productId: input.productId,
      delta: input.quantity,
      type: 'ADJUSTMENT',
      notes: input.notes,
      branchId: this.resolveBranchId(input.branchId ?? fallbackBranchId),
    });
  }

  /** Move qty between branches in one transaction. */
  async transfer(
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      fromBranchId: string;
      toBranchId: string;
      notes?: string | null;
    },
  ) {
    if (input.fromBranchId === input.toBranchId) {
      throw new BadRequestException('Choose two different branches');
    }
    const qty = Math.abs(input.quantity);
    if (qty <= 0) throw new BadRequestException('Quantity must be positive');

    return this.prisma.$transaction(async (tx) => {
      await this.mutateStock({
        tx,
        orgId,
        userId,
        productId: input.productId,
        delta: -qty,
        type: 'STOCK_OUT',
        branchId: input.fromBranchId,
        notes: input.notes ?? `Transfer to ${input.toBranchId}`,
        referenceType: 'BranchTransfer',
        referenceId: input.toBranchId,
      });
      return this.mutateStock({
        tx,
        orgId,
        userId,
        productId: input.productId,
        delta: qty,
        type: 'STOCK_IN',
        branchId: input.toBranchId,
        notes: input.notes ?? `Transfer from ${input.fromBranchId}`,
        referenceType: 'BranchTransfer',
        referenceId: input.fromBranchId,
      });
    });
  }

  stockInTx(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      notes?: string | null;
      unitCost?: number | null;
      branchId?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
    },
  ) {
    return this.mutateStock({
      tx,
      orgId,
      userId,
      productId: input.productId,
      delta: Math.abs(input.quantity),
      type: 'STOCK_IN',
      notes: input.notes,
      unitCost: input.unitCost,
      branchId: this.resolveBranchId(input.branchId),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
  }

  saleOut(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      invoiceId: string;
      branchId?: string | null;
    },
  ) {
    return this.mutateStock({
      tx,
      orgId,
      userId,
      productId: input.productId,
      delta: -Math.abs(input.quantity),
      type: 'SALE',
      invoiceId: input.invoiceId,
      referenceType: 'Invoice',
      referenceId: input.invoiceId,
      branchId: this.resolveBranchId(input.branchId),
    });
  }

  saleVoid(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    input: {
      productId: string;
      quantity: number;
      invoiceId: string;
      branchId?: string | null;
      notes?: string | null;
    },
  ) {
    return this.mutateStock({
      tx,
      orgId,
      userId,
      productId: input.productId,
      delta: Math.abs(input.quantity),
      type: 'SALE_VOID',
      invoiceId: input.invoiceId,
      referenceType: 'Invoice',
      referenceId: input.invoiceId,
      branchId: this.resolveBranchId(input.branchId),
      notes: input.notes,
    });
  }

  async branchQuantity(productId: string, branchId: string) {
    const row = await this.prisma.branchStock.findUnique({
      where: { productId_branchId: { productId, branchId } },
    });
    return Number(row?.quantity ?? 0);
  }

  async ledger(
    orgId: string,
    query: { cursor?: string; limit?: number; productId?: string; branchId?: string },
  ) {
    const limit = query.limit ?? 50;
    const items = await this.prisma.inventoryTransaction.findMany({
      where: {
        organizationId: orgId,
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id : null };
  }

  history(orgId: string, productId: string, branchId?: string) {
    return this.ledger(orgId, { productId, branchId, limit: 100 });
  }
}
