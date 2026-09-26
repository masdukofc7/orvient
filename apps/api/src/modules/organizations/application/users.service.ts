import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthTokenType, MembershipRole, Prisma } from '@inventory/database';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import {
  isOwnerRole,
  type CreateOrgUserInput,
  type InviteOrgUserInput,
  type UpdateOrgUserInput,
} from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { BillingService } from '../../billing/application/billing.service';
import { EmailService } from '../../../infrastructure/email/email.module';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly email: EmailService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async list(orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, email: true, name: true, isActive: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      isActive: m.isActive && m.user.isActive,
      membershipRole: m.role,
    }));
  }

  async create(orgId: string, actorId: string, input: CreateOrgUserInput) {
    await this.billing.assertPlanSeat(orgId, 'user');
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const already = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: existing.id, organizationId: orgId },
        },
      });
      if (already) throw new ConflictException('User already in this organization');
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const role = input.membershipRole as MembershipRole;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: input.name,
            passwordHash,
            isActive: true,
          },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: orgId,
            role,
          },
        });
        return { user, membership };
      });

      await this.audit.log({
        organizationId: orgId,
        userId: actorId,
        action: 'user.create',
        entityType: 'User',
        entityId: result.user.id,
        after: { email, membershipRole: role },
      });

      return {
        membershipId: result.membership.id,
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isActive: result.membership.isActive && result.user.isActive,
        membershipRole: result.membership.role,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  /** Email invite — user sets password via accept-invite link. */
  async invite(orgId: string, actorId: string, input: InviteOrgUserInput) {
    await this.billing.assertPlanSeat(orgId, 'user');
    const email = input.email.toLowerCase();
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const already = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: existing.id, organizationId: orgId },
        },
      });
      if (already) throw new ConflictException('User already in this organization');
      throw new ConflictException('Email already registered — ask them to sign in');
    }

    const role = input.membershipRole as MembershipRole;
    const placeholder = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
    });
    const raw = randomBytes(32).toString('base64url');

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name,
          passwordHash: placeholder,
          isActive: false,
        },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, organizationId: orgId, role },
      });
      await tx.authToken.create({
        data: {
          type: AuthTokenType.INVITE,
          tokenHash: this.hashToken(raw),
          email,
          userId: user.id,
          organizationId: orgId,
          membershipRole: role,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });
      return { user, membership };
    });

    await this.email.sendInvite(email, org.name, raw);
    await this.audit.log({
      organizationId: orgId,
      userId: actorId,
      action: 'user.invite',
      entityType: 'User',
      entityId: result.user.id,
      after: { email, membershipRole: role },
    });

    return {
      membershipId: result.membership.id,
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
      isActive: result.membership.isActive && result.user.isActive,
      membershipRole: result.membership.role,
      invited: true,
    };
  }

  async update(
    orgId: string,
    actorId: string,
    actorRole: string,
    userId: string,
    input: UpdateOrgUserInput,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    if (input.membershipRole === 'OWNER' && !isOwnerRole(actorRole)) {
      throw new ForbiddenException('Only an owner can grant owner');
    }
    if (
      membership.role === 'OWNER' &&
      input.membershipRole &&
      input.membershipRole !== 'OWNER' &&
      !isOwnerRole(actorRole)
    ) {
      throw new ForbiddenException('Only an owner can demote an owner');
    }

    if (input.membershipRole && input.membershipRole !== 'OWNER' && membership.role === 'OWNER') {
      const owners = await this.prisma.membership.count({
        where: { organizationId: orgId, role: 'OWNER', isActive: true },
      });
      if (owners <= 1) {
        throw new BadRequestException('Cannot demote the last owner');
      }
    }

    if (input.isActive === false && membership.role === 'OWNER') {
      const owners = await this.prisma.membership.count({
        where: {
          organizationId: orgId,
          role: 'OWNER',
          isActive: true,
          user: { isActive: true },
        },
      });
      if (owners <= 1) {
        throw new BadRequestException('Cannot deactivate the last owner');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: { role?: MembershipRole; isActive?: boolean } = {};
      if (input.membershipRole) data.role = input.membershipRole as MembershipRole;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      const next = Object.keys(data).length
        ? await tx.membership.update({ where: { id: membership.id }, data })
        : membership;
      return next;
    });

    await this.audit.log({
      organizationId: orgId,
      userId: actorId,
      action: 'user.update',
      entityType: 'User',
      entityId: userId,
      before: { membershipRole: membership.role, isActive: membership.isActive },
      after: { membershipRole: updated.role, isActive: updated.isActive },
    });

    return {
      membershipId: membership.id,
      userId: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      isActive: updated.isActive && membership.user.isActive,
      membershipRole: updated.role,
    };
  }
}
