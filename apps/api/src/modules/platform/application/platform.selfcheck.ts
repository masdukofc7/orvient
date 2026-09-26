/**
 * ponytail: platform admin access, suspend, and role gate.
 * Run: pnpm --filter @inventory/api exec tsx src/modules/platform/application/platform.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  MembershipRole,
  OrganizationStatus,
  PlatformRole,
} from '@inventory/database';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { PlatformService } from './platform.service';
import { AuditService } from '../../../common/services/audit.service';
import { BillingService } from '../../billing/application/billing.service';
import { DodoPaymentsService } from '../../billing/infrastructure/dodo-payments.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

function ctx(user: { isPlatformAdmin?: boolean } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as ExecutionContext;
}

async function selfcheck() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const suffix = randomBytes(3).toString('hex');
  const adminEmail = `padmin-${suffix}@orvient.test`;
  const supportEmail = `psupport-${suffix}@orvient.test`;
  const userEmail = `puser-${suffix}@orvient.test`;
  const hash = await argon2.hash('Selfcheck1!', { type: argon2.argon2id });

  const reflector = new Reflector();
  const realGet = reflector.getAllAndOverride.bind(reflector);
  reflector.getAllAndOverride = ((key: string, targets: unknown[]) => {
    if (key === 'platformAdmin') return true;
    return realGet(key, targets as never);
  }) as Reflector['getAllAndOverride'];
  const guard = new PlatformAdminGuard(reflector);

  assert.equal(guard.canActivate(ctx({ isPlatformAdmin: false })), false);
  assert.equal(guard.canActivate(ctx({ isPlatformAdmin: true })), true);
  assert.equal(guard.canActivate(ctx(undefined)), false);

  try {
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Platform Admin',
        passwordHash: hash,
        platformRole: PlatformRole.OWNER,
      },
    });
    const support = await prisma.user.create({
      data: {
        email: supportEmail,
        name: 'Platform Support',
        passwordHash: hash,
        platformRole: PlatformRole.SUPPORT,
      },
    });
    const regular = await prisma.user.create({
      data: {
        email: userEmail,
        name: 'Regular',
        passwordHash: hash,
        platformRole: PlatformRole.NONE,
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: regular.id,
        tokenHash: `selfcheck-${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const org = await prisma.organization.create({
      data: {
        name: `Plat Org ${suffix}`,
        slug: `plat-org-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    await prisma.membership.create({
      data: {
        userId: regular.id,
        organizationId: org.id,
        role: MembershipRole.OWNER,
      },
    });

    const audit = new AuditService(prisma);
    const billing = new BillingService(prisma, audit, new DodoPaymentsService(new ConfigService({})), new ConfigService({}));
    const service = new PlatformService(prisma, audit, billing);

    const listed = await service.listOrganizations({
      page: 1,
      limit: 50,
      search: `plat-org-${suffix}`,
    });
    assert.ok(listed.items.some((o) => o.id === org.id));
    assert.ok(typeof listed.total === 'number');

    await assert.rejects(
      () => service.updateUser(regular.id, { platformRole: 'OWNER' }, support.id, 'SUPPORT'),
      (err: unknown) => err instanceof ForbiddenException,
    );

    const suspended = await service.updateOrganization(
      org.id,
      { status: OrganizationStatus.SUSPENDED, reason: 'billing' },
      admin.id,
    );
    assert.equal(suspended.status, OrganizationStatus.SUSPENDED);
    assert.equal(suspended.statusReason, 'billing');

    const revoked = await prisma.refreshToken.findFirst({
      where: { userId: regular.id },
    });
    assert.ok(revoked?.revokedAt);

    const again = await service.getOrganization(org.id);
    assert.equal(again.status, OrganizationStatus.SUSPENDED);

    await service.updateOrganization(org.id, { status: OrganizationStatus.ACTIVE }, admin.id);

    console.log('platform.selfcheck ok');
  } finally {
    const doomed = await prisma.organization.findMany({
      where: { slug: `plat-org-${suffix}` },
      select: { id: true },
    });
    const orgIds = doomed.map((o) => o.id);
    if (orgIds.length) {
      await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: [adminEmail, supportEmail, userEmail] } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }
}

void selfcheck();
