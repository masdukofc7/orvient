import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus, PlatformRole, Prisma } from '@inventory/database';
import {
  pageOffset,
  csvDateTime,
  csvYesNo,
  humanizeEnum,
  type PaginationQuery,
  type PlatformOrgListQuery,
  type PlatformUpdateOrgInput,
  type PlatformUpdateUserInput,
  type PlatformUserListQuery,
} from '@inventory/shared';import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { BillingService } from '../../billing/application/billing.service';

// ponytail: export caps at 5000 rows; stream or page the file if a tenant dump exceeds that.
const EXPORT_CAP = 5000;

function csvCell(value: string | number | null | undefined) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async overview() {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [orgsActive, orgsSuspended, users, products, invoices, orgsLast7Days, usersLast7Days] =
      await Promise.all([
        this.prisma.organization.count({ where: { status: OrganizationStatus.ACTIVE } }),
        this.prisma.organization.count({ where: { status: OrganizationStatus.SUSPENDED } }),
        this.prisma.user.count(),
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.invoice.count(),
        this.prisma.organization.count({ where: { createdAt: { gte: since } } }),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      ]);
    return {
      orgsActive,
      orgsSuspended,
      orgsTotal: orgsActive + orgsSuspended,
      users,
      products,
      invoices,
      orgsLast7Days,
      usersLast7Days,
    };
  }

  async listOrganizations(query: PlatformOrgListQuery) {
    const where = this.orgWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        ...pageOffset(page, limit),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { memberships: true } } },
      }),
    ]);
    return {
      items: rows.map((o) => this.orgListItem(o)),
      total,
      page,
      limit,
    };
  }

  async exportOrganizations(query: PlatformOrgListQuery) {
    const rows = await this.prisma.organization.findMany({
      where: this.orgWhere(query),
      take: EXPORT_CAP,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { memberships: true } } },
    });
    const body = csv([
      ['ID', 'Name', 'Slug', 'Status', 'Status Reason', 'Members', 'Created At'],
      ...rows.map((o) => [
        o.id,
        o.name,
        o.slug,
        humanizeEnum(o.status),
        o.statusReason,
        o._count.memberships,
        csvDateTime(o.createdAt),
      ]),
    ]);
    return { filename: 'organizations.csv', csv: body };
  }

  async getOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        branches: { select: { id: true, name: true, code: true, isDefault: true } },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                isActive: true,
                platformRole: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            products: true,
            contacts: true,
            invoices: true,
            purchaseOrders: true,
          },
        },
        subscription: {
          include: { plan: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const liveSub = org.subscription
      ? await this.billing.ensurePastDue(org.subscription)
      : null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      statusReason: org.statusReason,
      internalNote: org.internalNote,
      defaultCurrency: org.defaultCurrency,
      email: org.email,
      phone: org.phone,
      createdAt: org.createdAt,
      branches: org.branches,
      subscription: liveSub
        ? {
            status: liveSub.status,
            billingCycle: liveSub.billingCycle,
            trialEndsAt: liveSub.trialEndsAt,
            currentPeriodStart: liveSub.currentPeriodStart,
            currentPeriodEnd: liveSub.currentPeriodEnd,
            graceEndsAt: liveSub.graceEndsAt,
            channel: liveSub.channel,
            plan: liveSub.plan,
          }
        : null,
      counts: {
        products: org._count.products,
        contacts: org._count.contacts,
        invoices: org._count.invoices,
        purchaseOrders: org._count.purchaseOrders,
        members: org.memberships.length,
      },
      members: org.memberships.map((m) => ({
        membershipId: m.id,
        membershipRole: m.role,
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        isActive: m.user.isActive,
        platformRole: m.user.platformRole,
        isPlatformAdmin: m.user.platformRole !== PlatformRole.NONE,
        lastLoginAt: m.user.lastLoginAt,
      })),
    };
  }

  async updateOrganization(id: string, input: PlatformUpdateOrgInput, actorId: string) {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Organization not found');

    const data: Prisma.OrganizationUpdateInput = {};
    if (input.internalNote !== undefined) data.internalNote = input.internalNote;
    if (input.status) {
      data.status = input.status;
      data.statusReason = input.status === OrganizationStatus.SUSPENDED ? input.reason : null;
    }

    const org = await this.prisma.organization.update({ where: { id }, data });

    if (input.status === OrganizationStatus.SUSPENDED) {
      await this.prisma.refreshToken.updateMany({
        where: {
          revokedAt: null,
          user: { memberships: { some: { organizationId: id } } },
        },
        data: { revokedAt: new Date() },
      });
    }

    if (input.status && input.status !== existing.status) {
      await this.audit.log({
        organizationId: id,
        userId: actorId,
        action: 'platform.org.status',
        entityType: 'Organization',
        entityId: id,
        before: { status: existing.status },
        after: { status: org.status, reason: input.reason ?? null },
      });
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      statusReason: org.statusReason,
      internalNote: org.internalNote,
    };
  }

  async listUsers(query: PlatformUserListQuery) {
    const where = this.userWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        ...pageOffset(page, limit),
        orderBy: { createdAt: 'desc' },
        include: {
          memberships: {
            include: { organization: { select: { id: true, name: true, slug: true } } },
          },
        },
      }),
    ]);
    return {
      items: rows.map((u) => this.userListItem(u)),
      total,
      page,
      limit,
    };
  }

  async exportUsers(query: PlatformUserListQuery) {
    const rows = await this.prisma.user.findMany({
      where: this.userWhere(query),
      take: EXPORT_CAP,
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { organization: { select: { name: true } } },
        },
      },
    });
    const body = csv([
      [
        'ID',
        'Email',
        'Name',
        'Active',
        'Platform Role',
        'Last Login',
        'Workspaces',
        'Created At',
      ],
      ...rows.map((u) => [
        u.id,
        u.email,
        u.name,
        csvYesNo(u.isActive),
        humanizeEnum(u.platformRole),
        csvDateTime(u.lastLoginAt),
        u.memberships.map((m) => m.organization.name).join('; '),
        csvDateTime(u.createdAt),
      ]),
    ]);
    return { filename: 'users.csv', csv: body };
  }

  async updateUser(
    id: string,
    input: PlatformUpdateUserInput,
    actorId: string,
    actorRole?: 'NONE' | 'SUPPORT' | 'OWNER',
  ) {
    if (id === actorId && input.isActive === false) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    if (input.platformRole !== undefined) {
      if (actorRole !== PlatformRole.OWNER) {
        throw new ForbiddenException('Only a platform owner can change platform roles');
      }
      if (id === actorId) {
        throw new BadRequestException('Cannot change your own platform role');
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    const data: Prisma.UserUpdateInput = {};
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.platformRole !== undefined) data.platformRole = input.platformRole;

    const user = await this.prisma.user.update({ where: { id }, data });

    if (input.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      userId: actorId,
      action: input.platformRole !== undefined ? 'platform.user.role' : 'platform.user.active',
      entityType: 'User',
      entityId: id,
      before: { isActive: existing.isActive, platformRole: existing.platformRole },
      after: {
        isActive: user.isActive,
        platformRole: user.platformRole,
        reason: input.reason ?? null,
      },
    });

    return this.userPublic(user);
  }

  async listAudit(query: PaginationQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search } },
      ];
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        ...pageOffset(page, limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        organizationId: row.organizationId,
        actorEmail: row.user?.email ?? null,
        before: row.before,
        after: row.after,
        createdAt: row.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  private orgWhere(query: PlatformOrgListQuery): Prisma.OrganizationWhereInput {
    const where: Prisma.OrganizationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private userWhere(query: PlatformUserListQuery): Prisma.UserWhereInput {
    if (!query.search) return {};
    return {
      OR: [
        { email: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }

  private orgListItem(o: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
    statusReason: string | null;
    createdAt: Date;
    _count: { memberships: number };
  }) {
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      statusReason: o.statusReason,
      createdAt: o.createdAt,
      memberCount: o._count.memberships,
    };
  }

  private userListItem(u: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    platformRole: PlatformRole;
    lastLoginAt: Date | null;
    createdAt: Date;
    memberships: Array<{
      role: string;
      organization: { id: string; name: string; slug: string };
    }>;
  }) {
    return {
      ...this.userPublic(u),
      createdAt: u.createdAt,
      memberships: u.memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        slug: m.organization.slug,
        membershipRole: m.role,
      })),
    };
  }

  private userPublic(u: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    platformRole: PlatformRole;
    lastLoginAt: Date | null;
  }) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      platformRole: u.platformRole,
      isPlatformAdmin: u.platformRole !== PlatformRole.NONE,
      lastLoginAt: u.lastLoginAt,
    };
  }
}
