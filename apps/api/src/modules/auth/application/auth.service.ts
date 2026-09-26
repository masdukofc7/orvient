import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import {
  DocumentSequenceType,
  MembershipRole,
  OrganizationStatus,
  PlatformRole,
  BillingCycle,
  SubscriptionStatus,
  AuthTokenType,
} from '@inventory/database';
import type {
  AuthMembershipOption,
  LoginInput,
  LoginOrgChoice,
  SessionUser,
  SignupInput,
  SwitchOrgInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  AcceptInviteInput,
} from '@inventory/shared';
import { TRIAL_DAYS } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { EmailService } from '../../../infrastructure/email/email.module';
import { RedisService } from '../../../infrastructure/redis/redis.service';

const LOCK_TTL_SEC = 15 * 60;
const LOCK_MAX_EMAIL = 8;
const LOCK_MAX_IP = 30;

type MembershipOrg = {
  id: string;
  role: string;
  organizationId: string;
  organization: {
    name: string;
    slug: string;
    status: OrganizationStatus;
    defaultCurrency: string;
    brandColor: string;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async assertAuthUnlocked(email: string, ip?: string) {
    const e = await this.redis.get(`auth:fail:email:${email}`);
    if (e && Number(e) >= LOCK_MAX_EMAIL) {
      throw new HttpException(
        'Too many attempts — try again in 15 minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (ip) {
      const i = await this.redis.get(`auth:fail:ip:${ip}`);
      if (i && Number(i) >= LOCK_MAX_IP) {
        throw new HttpException(
          'Too many attempts — try again in 15 minutes',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async recordAuthFail(email: string, ip?: string) {
    await this.redis.incr(`auth:fail:email:${email}`, LOCK_TTL_SEC);
    if (ip) await this.redis.incr(`auth:fail:ip:${ip}`, LOCK_TTL_SEC);
  }

  private async clearAuthFails(email: string, ip?: string) {
    await this.redis.del(`auth:fail:email:${email}`);
    if (ip) await this.redis.del(`auth:fail:ip:${ip}`);
  }

  private parseDurationMs(value: string, fallbackMs: number) {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return fallbackMs;
    const n = Number(match[1]);
    const unit = match[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
  }

  private toSessionUser(
    user: { id: string; email: string; name: string; platformRole: PlatformRole },
    membership: MembershipOrg,
    branchId: string | null,
  ): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
      defaultCurrency: membership.organization.defaultCurrency,
      brandColor: membership.organization.brandColor,
      membershipRole: membership.role,
      branchId,
      platformRole: user.platformRole,
      isPlatformAdmin: user.platformRole !== PlatformRole.NONE,
    };
  }

  private toMembershipOption(m: MembershipOrg): AuthMembershipOption {
    return {
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      slug: m.organization.slug,
      membershipRole: m.role,
    };
  }

  private assertActiveOrg(membership: MembershipOrg) {
    if (membership.organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('Organization is suspended');
    }
  }

  private async defaultBranchId(organizationId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { organizationId, isDefault: true },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  /** slugify + uniquify against organizations.slug */
  private async uniqueSlug(name: string) {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'org';
    let slug = base;
    for (let i = 0; i < 20; i++) {
      const exists = await this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!exists) return slug;
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private async issueSession(
    user: { id: string; email: string; name: string; platformRole: PlatformRole },
    membership: MembershipOrg,
    meta?: { ip?: string; userAgent?: string },
    preferredBranchId?: string | null,
  ) {
    this.assertActiveOrg(membership);
    let branchId = preferredBranchId ?? null;
    if (branchId) {
      const ok = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!ok) branchId = null;
    }
    if (!branchId) {
      branchId = await this.defaultBranchId(membership.organizationId);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      organizationId: membership.organizationId,
      membershipRole: membership.role,
      branchId,
      platformRole: user.platformRole,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';
    const expiresAt = new Date(
      Date.now() + this.parseDurationMs(refreshExpires, 7 * 86_400_000),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: this.toSessionUser(user, membership, branchId),
    };
  }

  async signup(input: SignupInput, meta?: { ip?: string; userAgent?: string }) {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const slug = await this.uniqueSlug(input.organizationName);
    const currency = input.defaultCurrency ?? 'BDT';

    const plan = await this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
    if (!plan) throw new BadRequestException('No plans available — seed plans first');

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name,
          passwordHash,
          isActive: true,
        },
      });
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
          status: OrganizationStatus.ACTIVE,
          defaultCurrency: currency,
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
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: MembershipRole.OWNER,
        },
        include: { organization: true },
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
      // ponytail: trial always starts on cheapest active plan; pick/pay later in Billing
      await tx.organizationSubscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          status: SubscriptionStatus.TRIALING,
          billingCycle: BillingCycle.MONTHLY,
          trialEndsAt,
          currentPeriodStart: trialStartedAt,
          currentPeriodEnd: trialEndsAt,
        },
      });
      return { user, membership };
    });

    await this.audit.log({
      organizationId: created.membership.organizationId,
      userId: created.user.id,
      action: 'auth.signup',
      entityType: 'Organization',
      entityId: created.membership.organizationId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return this.issueSession(created.user, created.membership, meta);
  }

  async login(
    input: LoginInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: SessionUser } | LoginOrgChoice> {
    const email = input.email.toLowerCase();
    await this.assertAuthUnlocked(email, meta?.ip);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || !user.isActive) {
      await this.recordAuthFail(email, meta?.ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.recordAuthFail(email, meta?.ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.clearAuthFails(email, meta?.ip);

    const active = user.memberships.filter(
      (m) => m.isActive && m.organization.status === OrganizationStatus.ACTIVE,
    );
    if (!active.length) {
      throw new ForbiddenException('User has no active organization membership');
    }

    if (!input.organizationId && active.length > 1) {
      return {
        requiresOrgChoice: true,
        memberships: active.map((m) => this.toMembershipOption(m)),
      };
    }

    const membership = input.organizationId
      ? active.find((m) => m.organizationId === input.organizationId)
      : active[0];
    if (!membership) {
      throw new ForbiddenException('Not a member of that organization');
    }

    const session = await this.issueSession(user, membership, meta);
    await this.audit.log({
      organizationId: membership.organizationId,
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return session;
  }

  async switchOrg(
    userId: string,
    input: SwitchOrgInput,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isActive: true, platformRole: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: input.organizationId },
      },
      include: { organization: true },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('Not a member of that organization');
    }

    // Revoke existing refresh tokens so old-org sessions die on refresh
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const session = await this.issueSession(user, membership, meta);
    await this.audit.log({
      organizationId: membership.organizationId,
      userId: user.id,
      action: 'auth.switch_org',
      entityType: 'Organization',
      entityId: membership.organizationId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return session;
  }

  async switchBranch(
    userId: string,
    organizationId: string,
    input: { branchId: string },
    meta?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isActive: true, platformRole: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: true },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('Not a member of that organization');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, organizationId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const session = await this.issueSession(user, membership, meta, branch.id);
    await this.audit.log({
      organizationId,
      userId,
      action: 'auth.switch_branch',
      entityType: 'Branch',
      entityId: branch.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return session;
  }

  async listMemberships(userId: string): Promise<AuthMembershipOption[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        isActive: true,
        organization: { status: OrganizationStatus.ACTIVE },
      },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => this.toMembershipOption(m));
  }

  async refresh(refreshToken: string, preferredOrgId?: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              include: { organization: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = stored.user;
    if (!user.isActive) throw new UnauthorizedException('User inactive');

    const active = user.memberships.filter(
      (m) => m.isActive && m.organization.status === OrganizationStatus.ACTIVE,
    );
    const membership = preferredOrgId
      ? active.find((m) => m.organizationId === preferredOrgId)
      : active[0];
    if (!membership) throw new ForbiddenException('No membership');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(
      user,
      membership,
      { ip: stored.ip ?? undefined, userAgent: stored.userAgent ?? undefined },
    );
  }

  async logout(refreshToken?: string, userId?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (userId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async me(
    userId: string,
    organizationId: string,
    preferredBranchId?: string | null,
  ): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isActive: true, platformRole: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new ForbiddenException('Organization not found');
    if (org.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('Organization is suspended');
    }
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (!membership || !membership.isActive) throw new ForbiddenException('No membership');

    let branchId = preferredBranchId ?? null;
    if (branchId) {
      const ok = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { id: true },
      });
      if (!ok) branchId = null;
    }
    if (!branchId) branchId = await this.defaultBranchId(organizationId);

    return this.toSessionUser(
      user,
      {
        id: membership.id,
        role: membership.role,
        organizationId,
        organization: {
          name: org.name,
          slug: org.slug,
          status: org.status,
          defaultCurrency: org.defaultCurrency,
          brandColor: org.brandColor,
        },
      },
      branchId,
    );
  }

  /** Always 200 — do not reveal whether the email exists. */
  async forgotPassword(input: ForgotPasswordInput, meta?: { ip?: string }) {
    const email = input.email.toLowerCase();
    await this.assertAuthUnlocked(`forgot:${email}`, meta?.ip);
    await this.recordAuthFail(`forgot:${email}`, meta?.ip);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) return { ok: true };

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.authToken.create({
      data: {
        type: AuthTokenType.PASSWORD_RESET,
        tokenHash,
        email,
        userId: user.id,
        expiresAt,
      },
    });
    await this.email.sendPasswordReset(email, raw);
    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = this.hashToken(input.token);
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash } });
    if (
      !row ||
      row.type !== AuthTokenType.PASSWORD_RESET ||
      row.usedAt ||
      row.expiresAt < new Date() ||
      !row.userId
    ) {
      throw new BadRequestException('Invalid or expired reset link');
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async acceptInvite(input: AcceptInviteInput) {
    const tokenHash = this.hashToken(input.token);
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash } });
    if (
      !row ||
      row.type !== AuthTokenType.INVITE ||
      row.usedAt ||
      row.expiresAt < new Date() ||
      !row.userId
    ) {
      throw new BadRequestException('Invalid or expired invite');
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash, isActive: true },
      }),
      this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true, email: row.email };
  }
}
