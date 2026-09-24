import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@inventory/database';
import { CreateContactInput, UpdateContactInput, PaginationQuery } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, userId: string, input: CreateContactInput) {
    const contact = await this.prisma.contact.create({
      data: {
        organizationId: orgId,
        name: input.name,
        phone: input.phone ?? null,
        address: input.address ?? null,
        email: input.email ?? null,
        type: input.type,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      userId,
      action: 'contact.create',
      entityType: 'Contact',
      entityId: contact.id,
      after: contact,
    });
    return contact;
  }

  async update(orgId: string, userId: string, id: string, input: UpdateContactInput) {
    await this.findOne(orgId, id);
    return this.prisma.contact.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
  }

  async softDelete(orgId: string, userId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }

  async findOne(orgId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async list(orgId: string, query: PaginationQuery & { type?: 'CUSTOMER' | 'SUPPLIER' }) {
    const limit = query.limit ?? 50;
    const where: Prisma.ContactWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.contact.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id : null };
  }
}
