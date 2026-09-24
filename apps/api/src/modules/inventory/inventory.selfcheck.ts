/**
 * ponytail: branch-scoped stock + transfer stays isolated per branch.
 * Run: pnpm --filter @inventory/api exec tsx src/modules/inventory/inventory.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { BadRequestException } from '@nestjs/common';
import {
  PrismaClient,
  MembershipRole,
  OrganizationStatus,
  ProductStatus,
} from '@inventory/database';
import { InventoryService } from './inventory.service';
import { AuditService } from '../../common/services/audit.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { RedisService } from '../../infrastructure/redis/redis.service';

async function selfcheck() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const suffix = randomBytes(3).toString('hex');
  const hash = await argon2.hash('Selfcheck1!', { type: argon2.argon2id });
  const redis = { del: async () => 1 } as unknown as RedisService;
  const audit = new AuditService(prisma);
  const inventory = new InventoryService(prisma, redis, audit);

  const user = await prisma.user.create({
    data: { email: `inv-${suffix}@orvient.test`, name: 'Inv', passwordHash: hash },
  });
  const org = await prisma.organization.create({
    data: {
      name: `Inv Org ${suffix}`,
      slug: `inv-org-${suffix}`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, role: MembershipRole.OWNER },
  });
  const main = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Main', code: 'MAIN', isDefault: true },
  });
  const east = await prisma.branch.create({
    data: { organizationId: org.id, name: 'East', code: 'EAST', isDefault: false },
  });
  const product = await prisma.product.create({
    data: {
      organizationId: org.id,
      name: 'Widget',
      sku: `W-${suffix}`,
      costPrice: 1,
      sellingPrice: 2,
      stock: 0,
      status: ProductStatus.ACTIVE,
      category: 'Parts',
      createdById: user.id,
      updatedById: user.id,
    },
  });

  try {
    await inventory.stockIn(
      org.id,
      user.id,
      { productId: product.id, quantity: 10 },
      main.id,
    );
    let bs = await prisma.branchStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: product.id, branchId: main.id } },
    });
    assert.equal(Number(bs.quantity), 10);

    await inventory.transfer(org.id, user.id, {
      productId: product.id,
      quantity: 4,
      fromBranchId: main.id,
      toBranchId: east.id,
    });
    bs = await prisma.branchStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: product.id, branchId: main.id } },
    });
    const eastStock = await prisma.branchStock.findUniqueOrThrow({
      where: { productId_branchId: { productId: product.id, branchId: east.id } },
    });
    assert.equal(Number(bs.quantity), 6);
    assert.equal(Number(eastStock.quantity), 4);
    const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(Number(refreshed.stock), 10);

    let blocked = false;
    try {
      await inventory.stockOut(
        org.id,
        user.id,
        { productId: product.id, quantity: 7 },
        main.id,
      );
    } catch (e) {
      blocked = e instanceof BadRequestException;
    }
    assert.equal(blocked, true, 'cannot overdraw branch stock');

    console.log('inventory.selfcheck ok');
  } finally {
    await prisma.inventoryTransaction.deleteMany({ where: { organizationId: org.id } });
    await prisma.branchStock.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { organizationId: org.id } });
    await prisma.branch.deleteMany({ where: { organizationId: org.id } });
    await prisma.membership.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

selfcheck().catch((e) => {
  console.error(e);
  process.exit(1);
});
