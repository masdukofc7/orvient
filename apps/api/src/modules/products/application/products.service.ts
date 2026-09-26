import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@inventory/database';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductListQuery,
  resolveProductBarcode,
  parseProductCsv,
} from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AuditService } from '../../../common/services/audit.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private barcodeCacheKey(orgId: string, barcode: string) {
    return `product:barcode:${orgId}:${barcode}`;
  }

  async create(
    orgId: string,
    userId: string,
    input: CreateProductInput,
    branchId?: string | null,
  ) {
    const opening = input.stock ?? 0;
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        let resolvedBranchId = branchId ?? null;
        if (!resolvedBranchId) {
          const def = await tx.branch.findFirst({
            where: { organizationId: orgId, isDefault: true },
            select: { id: true },
          });
          resolvedBranchId = def?.id ?? null;
        }
        if (!resolvedBranchId) {
          throw new ConflictException('No branch available for opening stock');
        }

        const created = await tx.product.create({
          data: {
            organizationId: orgId,
            name: input.name,
            barcode: resolveProductBarcode(input.barcode, input.sku),
            sku: input.sku,
            category: input.category ?? undefined,
            costPrice: input.costPrice,
            sellingPrice: input.sellingPrice,
            stock: opening,
            lowStockAt: input.lowStockAt ?? 5,
            unit: input.unit ?? 'pcs',
            status: input.status ?? 'ACTIVE',
            createdById: userId,
            updatedById: userId,
          },
        });

        await tx.branchStock.create({
          data: {
            productId: created.id,
            branchId: resolvedBranchId,
            quantity: opening,
          },
        });

        if (opening > 0) {
          await tx.inventoryTransaction.create({
            data: {
              organizationId: orgId,
              branchId: resolvedBranchId,
              productId: created.id,
              type: 'STOCK_IN',
              quantity: opening,
              quantityBefore: 0,
              quantityAfter: opening,
              notes: 'Opening stock',
              createdById: userId,
            },
          });
        }

        return created;
      });

      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'product.create',
        entityType: 'Product',
        entityId: product.id,
        after: product,
      });
      return product;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('SKU or barcode already exists');
      }
      throw e;
    }
  }

  async update(orgId: string, userId: string, id: string, input: UpdateProductInput) {
    const existing = await this.findOne(orgId, id);
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...input,
          barcode: input.barcode === undefined ? undefined : input.barcode,
          updatedById: userId,
        },
      });
      if (existing.barcode) {
        await this.redis.del(this.barcodeCacheKey(orgId, existing.barcode));
      }
      if (product.barcode) {
        await this.redis.del(this.barcodeCacheKey(orgId, product.barcode));
      }
      await this.audit.log({
        organizationId: orgId,
        userId,
        action: 'product.update',
        entityType: 'Product',
        entityId: id,
        before: existing,
        after: product,
      });
      return product;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('SKU or barcode already exists');
      }
      throw e;
    }
  }

  async softDelete(orgId: string, userId: string, id: string) {
    const existing = await this.findOne(orgId, id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId, status: 'INACTIVE' },
    });
    if (existing.barcode) {
      await this.redis.del(this.barcodeCacheKey(orgId, existing.barcode));
    }
    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'product.delete',
      entityType: 'Product',
      entityId: id,
      before: existing,
    });
    return product;
  }

  /**
   * Create products from a batch (or full CSV). Continues past row errors;
   * does not update existing SKUs. Prefer small batches from the client.
   */
  async import(
    orgId: string,
    userId: string,
    body: { csv: string } | { products: CreateProductInput[] },
    branchId?: string | null,
  ) {
    let pending: Array<{ line: number; input: CreateProductInput }>;
    const errors: Array<{ line: number; message: string }> = [];

    if ('csv' in body) {
      let parsed: ReturnType<typeof parseProductCsv>;
      try {
        parsed = parseProductCsv(body.csv);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Invalid CSV');
      }
      errors.push(...parsed.errors);
      pending = parsed.rows;
    } else {
      pending = body.products.map((input, i) => ({ line: i + 1, input }));
    }

    let created = 0;
    for (const { line, input } of pending) {
      try {
        await this.create(orgId, userId, input, branchId);
        created += 1;
      } catch (e) {
        const message =
          e instanceof ConflictException
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Create failed';
        errors.push({ line, message });
      }
    }

    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'product.import',
      entityType: 'Product',
      after: { created, failed: errors.length },
    });

    return { created, failed: errors.length, errors: errors.slice(0, 50) };
  }

  /** Set barcode = sku for products with a blank barcode. Skips SKU conflicts. */
  async backfillBarcodes(orgId: string, userId: string) {
    const blanks = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null, barcode: null },
      select: { id: true, sku: true },
    });

    let updated = 0;
    let skipped = 0;
    for (const row of blanks) {
      try {
        await this.prisma.product.update({
          where: { id: row.id },
          data: { barcode: row.sku, updatedById: userId },
        });
        updated += 1;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          skipped += 1;
          continue;
        }
        throw e;
      }
    }

    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'product.backfill_barcodes',
      entityType: 'Product',
      after: { updated, skipped },
    });

    return { updated, skipped };
  }

  async findOne(orgId: string, id: string, branchId?: string | null) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.withBranchStock(product, branchId);
  }

  async findByBarcode(orgId: string, barcode: string, branchId?: string | null) {
    const cacheKey = this.barcodeCacheKey(orgId, barcode);
    // Don't cache branch-scoped stock overlays
    if (!branchId) {
      const cached = await this.redis.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached);
    }

    const product = await this.prisma.product.findFirst({
      where: { organizationId: orgId, barcode, deletedAt: null, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('Product not found for barcode');
    if (!branchId) {
      await this.redis.set(cacheKey, JSON.stringify(product), 60).catch(() => undefined);
    }
    return this.withBranchStock(product, branchId);
  }

  async list(orgId: string, query: ProductListQuery, branchId?: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.ProductWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { category: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const data = await this.withBranchStockMany(rows, branchId);
    return { data, total, page, limit };
  }

  private async withBranchStock<T extends { id: string; stock: unknown }>(
    product: T,
    branchId?: string | null,
  ) {
    if (!branchId) return { ...product, orgStock: product.stock };
    const row = await this.prisma.branchStock.findUnique({
      where: { productId_branchId: { productId: product.id, branchId } },
    });
    return {
      ...product,
      orgStock: product.stock,
      stock: row?.quantity ?? 0,
    };
  }

  private async withBranchStockMany<T extends { id: string; stock: unknown }>(
    products: T[],
    branchId?: string | null,
  ) {
    if (!branchId || !products.length) {
      return products.map((p) => ({ ...p, orgStock: p.stock }));
    }
    const rows = await this.prisma.branchStock.findMany({
      where: {
        branchId,
        productId: { in: products.map((p) => p.id) },
      },
    });
    const map = new Map(rows.map((r) => [r.productId, r.quantity]));
    return products.map((p) => ({
      ...p,
      orgStock: p.stock,
      stock: map.get(p.id) ?? 0,
    }));
  }
}
