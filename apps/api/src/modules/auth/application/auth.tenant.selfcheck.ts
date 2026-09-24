/**
 * ponytail: one runnable check for multi-tenant isolation.
 * Run: pnpm --filter @inventory/api exec tsx src/modules/auth/application/auth.tenant.selfcheck.ts
 * (requires DATABASE_URL and applied migrations)
 */
import { PrismaClient, MembershipRole, DocumentSequenceType, ProductStatus } from '@inventory/database';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import assert from 'node:assert/strict';

async function selfcheck() {
  const prisma = new PrismaClient();
  const suffix = randomBytes(4).toString('hex');
  const emailA = `tenant-a-${suffix}@orvient.test`;
  const emailB = `tenant-b-${suffix}@orvient.test`;

  try {
    const hash = await argon2.hash('Selfcheck1!', { type: argon2.argon2id });

    const orgA = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: emailA, name: 'Tenant A', passwordHash: hash },
      });
      const organization = await tx.organization.create({
        data: {
          name: `Tenant A ${suffix}`,
          slug: `tenant-a-${suffix}`,
          status: 'ACTIVE',
        },
      });
      await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: 'Main',
          code: 'MAIN',
          isDefault: true,
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: MembershipRole.OWNER,
        },
      });
      await tx.documentSequence.createMany({
        data: [
          {
            organizationId: organization.id,
            type: DocumentSequenceType.INVOICE,
            prefix: 'INV',
            nextValue: 1,
          },
          {
            organizationId: organization.id,
            type: DocumentSequenceType.PURCHASE_ORDER,
            prefix: 'PO',
            nextValue: 1,
          },
        ],
      });
      const product = await tx.product.create({
        data: {
          organizationId: organization.id,
          name: 'Isolated Widget',
          sku: `SKU-A-${suffix}`,
          costPrice: 1,
          sellingPrice: 2,
          stock: 10,
          status: ProductStatus.ACTIVE,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      return { organization, product, user };
    });

    const orgB = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: emailB, name: 'Tenant B', passwordHash: hash },
      });
      const organization = await tx.organization.create({
        data: {
          name: `Tenant B ${suffix}`,
          slug: `tenant-b-${suffix}`,
          status: 'ACTIVE',
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: MembershipRole.OWNER,
        },
      });
      return { organization, user };
    });

    const dup = await prisma.user.findUnique({ where: { email: emailA } });
    assert.ok(dup, 'signup user exists');

    let conflict = false;
    try {
      await prisma.user.create({
        data: { email: emailA, name: 'Dup', passwordHash: hash },
      });
    } catch {
      conflict = true;
    }
    assert.equal(conflict, true, 'duplicate email must fail');

    const visibleToA = await prisma.product.findMany({
      where: { organizationId: orgA.organization.id },
    });
    const visibleToB = await prisma.product.findMany({
      where: { organizationId: orgB.organization.id },
    });
    assert.equal(visibleToA.length, 1);
    assert.equal(visibleToA[0]?.id, orgA.product.id);
    assert.equal(visibleToB.length, 0, 'org B must not see org A products');

    const cross = await prisma.product.findFirst({
      where: { id: orgA.product.id, organizationId: orgB.organization.id },
    });
    assert.equal(cross, null, 'cross-org product lookup must miss');

    console.log('auth.tenant.selfcheck ok');
  } finally {
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: [`tenant-a-${suffix}`, `tenant-b-${suffix}`] } } },
    });
    await prisma.membership.deleteMany({
      where: { organization: { slug: { in: [`tenant-a-${suffix}`, `tenant-b-${suffix}`] } } },
    });
    await prisma.branch.deleteMany({
      where: { organization: { slug: { in: [`tenant-a-${suffix}`, `tenant-b-${suffix}`] } } },
    });
    await prisma.documentSequence.deleteMany({
      where: { organization: { slug: { in: [`tenant-a-${suffix}`, `tenant-b-${suffix}`] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: [`tenant-a-${suffix}`, `tenant-b-${suffix}`] } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await prisma.$disconnect();
  }
}

void selfcheck();
