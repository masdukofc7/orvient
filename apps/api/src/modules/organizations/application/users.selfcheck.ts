/**
 * Org deactivate must not flip global User.isActive; only OWNER may grant OWNER.
 * Run: pnpm --filter @inventory/api exec tsx src/modules/organizations/application/users.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, OrganizationStatus, PrismaClient } from '@inventory/database';
import { UsersService } from './users.service';
import { AuditService } from '../../../common/services/audit.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { BillingService } from '../../billing/application/billing.service';
import type { EmailService } from '../../../infrastructure/email/email.module';

async function selfcheck() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const suffix = randomBytes(3).toString('hex');
  const hash = await argon2.hash('Selfcheck1!', { type: argon2.argon2id });
  const audit = new AuditService(prisma);
  const billing = { assertPlanSeat: async () => undefined } as unknown as BillingService;
  const email = { sendInvite: async () => undefined } as unknown as EmailService;
  const users = new UsersService(prisma, audit, billing, email);

  const owner = await prisma.user.create({
    data: { email: `own-${suffix}@orvient.test`, name: 'Owner', passwordHash: hash },
  });
  const admin = await prisma.user.create({
    data: { email: `adm-${suffix}@orvient.test`, name: 'Admin', passwordHash: hash },
  });
  const cashier = await prisma.user.create({
    data: { email: `csh-${suffix}@orvient.test`, name: 'Cashier', passwordHash: hash },
  });
  const orgA = await prisma.organization.create({
    data: { name: `A ${suffix}`, slug: `a-${suffix}`, status: OrganizationStatus.ACTIVE },
  });
  const orgB = await prisma.organization.create({
    data: { name: `B ${suffix}`, slug: `b-${suffix}`, status: OrganizationStatus.ACTIVE },
  });
  await prisma.membership.createMany({
    data: [
      { userId: owner.id, organizationId: orgA.id, role: MembershipRole.OWNER },
      { userId: admin.id, organizationId: orgA.id, role: MembershipRole.ADMIN },
      { userId: cashier.id, organizationId: orgA.id, role: MembershipRole.CASHIER },
      { userId: cashier.id, organizationId: orgB.id, role: MembershipRole.CASHIER },
    ],
  });

  try {
    await users.update(orgA.id, admin.id, 'ADMIN', cashier.id, { isActive: false });
    const userRow = await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } });
    assert.equal(userRow.isActive, true, 'global user must stay active');
    const memA = await prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: cashier.id, organizationId: orgA.id } },
    });
    assert.equal(memA.isActive, false);
    const memB = await prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: cashier.id, organizationId: orgB.id } },
    });
    assert.equal(memB.isActive, true);

    await assert.rejects(
      () => users.update(orgA.id, admin.id, 'ADMIN', cashier.id, { membershipRole: 'OWNER' }),
      (e) => e instanceof ForbiddenException,
    );

    await users.update(orgA.id, owner.id, 'OWNER', cashier.id, { membershipRole: 'OWNER' });
    const promoted = await prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: cashier.id, organizationId: orgA.id } },
    });
    assert.equal(promoted.role, MembershipRole.OWNER);
  } finally {
    await prisma.membership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, admin.id, cashier.id] } } });
    await prisma.$disconnect();
  }
}

selfcheck().catch((err) => {
  console.error(err);
  process.exit(1);
});
