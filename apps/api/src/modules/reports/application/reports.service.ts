import { Injectable } from '@nestjs/common';
import { Prisma } from '@inventory/database';
import { csvDate, csvMoney, paymentStatusLabel } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async dashboard(orgId: string) {
    const cacheKey = `dashboard:${orgId}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [todaySales, totalProducts, lowStockCount, recentInvoices] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId: orgId,
          status: 'FINALIZED',
          finalizedAt: { gte: start },
        },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.product.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint as count
        FROM products
        WHERE "organizationId" = ${orgId}
          AND "deletedAt" IS NULL
          AND status = 'ACTIVE'
          AND stock <= "lowStockAt"
      `,
      this.prisma.invoice.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { contact: { select: { name: true } } },
      }),
    ]);

    const payload = {
      todaySalesTotal: Number(todaySales._sum.grandTotal ?? 0),
      todaySalesCount: todaySales._count,
      totalProducts,
      lowStockCount: Number(lowStockCount[0]?.count ?? 0),
      recentInvoices,
    };

    await this.redis.set(cacheKey, JSON.stringify(payload), 30).catch(() => undefined);
    return payload;
  }

  async sales(orgId: string, from?: Date, to?: Date) {
    const where: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      status: 'FINALIZED',
      ...(from || to
        ? {
            finalizedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [aggregate, byDay] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _sum: { grandTotal: true, subtotal: true, discount: true, taxAmount: true },
        _count: true,
      }),
      this.prisma.$queryRaw<
        { day: Date; total: Prisma.Decimal; count: bigint }[]
      >`
        SELECT date_trunc('day', "finalizedAt") as day,
               COALESCE(SUM("grandTotal"), 0) as total,
               COUNT(*)::bigint as count
        FROM invoices
        WHERE "organizationId" = ${orgId}
          AND status = 'FINALIZED'
          AND "finalizedAt" IS NOT NULL
          ${from ? Prisma.sql`AND "finalizedAt" >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND "finalizedAt" <= ${to}` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 60
      `,
    ]);

    return {
      summary: {
        count: aggregate._count,
        grandTotal: Number(aggregate._sum.grandTotal ?? 0),
        subtotal: Number(aggregate._sum.subtotal ?? 0),
        discount: Number(aggregate._sum.discount ?? 0),
        taxAmount: Number(aggregate._sum.taxAmount ?? 0),
      },
      byDay: byDay.map((r) => ({
        day: r.day,
        total: Number(r.total),
        count: Number(r.count),
      })),
    };
  }

  async inventory(orgId: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        costPrice: true,
        sellingPrice: true,
        unit: true,
        status: true,
      },
      orderBy: { name: 'asc' },
      take: 5000,
    });

    const valuation = products.reduce(
      (acc, p) => {
        const stock = Number(p.stock);
        acc.costValue += stock * Number(p.costPrice);
        acc.retailValue += stock * Number(p.sellingPrice);
        return acc;
      },
      { costValue: 0, retailValue: 0 },
    );

    return { products, valuation };
  }

  async lowStock(orgId: string) {
    return this.prisma.$queryRaw`
      SELECT id, name, sku, barcode, stock, "lowStockAt", unit, "sellingPrice"
      FROM products
      WHERE "organizationId" = ${orgId}
        AND "deletedAt" IS NULL
        AND status = 'ACTIVE'
        AND stock <= "lowStockAt"
      ORDER BY stock ASC
      LIMIT 500
    `;
  }

  /** Accounting export — finalized invoices in range as CSV. */
  async exportSalesCsv(orgId: string, from?: Date, to?: Date) {
    const where: Prisma.InvoiceWhereInput = {
      organizationId: orgId,
      status: 'FINALIZED',
      ...(from || to
        ? {
            finalizedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.invoice.findMany({
      where,
      orderBy: { finalizedAt: 'asc' },
      include: { contact: { select: { name: true } } },
      take: 10_000,
    });
    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Invoice Number',
      'Date',
      'Customer',
      'Currency',
      'Subtotal',
      'Discount',
      'Tax',
      'Grand Total',
      'Paid Amount',
      'Payment Status',
    ];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          escape(r.invoiceNumber),
          escape(csvDate(r.finalizedAt)),
          escape(r.contact?.name ?? 'Walk-in'),
          escape(r.currency),
          csvMoney(r.subtotal),
          csvMoney(r.discount),
          csvMoney(r.taxAmount),
          csvMoney(r.grandTotal),
          csvMoney(r.paidAmount),
          escape(paymentStatusLabel(r.paymentStatus)),
        ].join(','),
      ),
    ];
    const fromLabel = csvDate(from) || 'all';
    const toLabel = csvDate(to) || 'now';
    return {
      filename: `sales-${fromLabel}-${toLabel}.csv`,
      csv: lines.join('\n'),
    };
  }

  async productHistory(orgId: string, productId: string) {
    return this.prisma.inventoryTransaction.findMany({
      where: { organizationId: orgId, productId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async customerPurchases(orgId: string, contactId: string) {
    return this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        contactId,
        status: 'FINALIZED',
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
