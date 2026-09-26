import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@inventory/database';
import {
  CreateContactInput,
  UpdateContactInput,
  PaginationQuery,
  pageOffset,
} from '@inventory/shared';
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
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

    const [total, data] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        ...pageOffset(page, limit),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { data, total, page, limit };
  }
}
