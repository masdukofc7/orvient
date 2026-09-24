import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@inventory/database';
import type {
  CreateBranchInput,
  UpdateBranchInput,
  UpdateOrganizationInput,
} from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { branches: { orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(orgId: string, input: UpdateOrganizationInput) {
    const data = {
      ...input,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      address: emptyToNull(input.address),
      website: emptyToNull(input.website),
      taxId: emptyToNull(input.taxId),
      logoUrl: emptyToNull(input.logoUrl),
    };
    return this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
  }

  listBranches(orgId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createBranch(orgId: string, input: CreateBranchInput) {
    const code = input.code?.trim() || undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.branch.updateMany({
            where: { organizationId: orgId },
            data: { isDefault: false },
          });
        }
        const hasAny = await tx.branch.count({ where: { organizationId: orgId } });
        return tx.branch.create({
          data: {
            organizationId: orgId,
            name: input.name,
            code,
            address: input.address ?? undefined,
            isDefault: input.isDefault ?? hasAny === 0,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Branch code already exists');
      }
      throw e;
    }
  }

  async updateBranch(orgId: string, id: string, input: UpdateBranchInput) {
    const existing = await this.prisma.branch.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Branch not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isDefault === true) {
          await tx.branch.updateMany({
            where: { organizationId: orgId },
            data: { isDefault: false },
          });
        }
        if (input.isDefault === false && existing.isDefault) {
          throw new BadRequestException('Set another branch as default first');
        }
        return tx.branch.update({
          where: { id },
          data: {
            name: input.name,
            code: input.code === undefined ? undefined : input.code || null,
            address: input.address === undefined ? undefined : input.address,
            isDefault: input.isDefault,
          },
        });
      });
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Branch code already exists');
      }
      throw e;
    }
  }
}

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return value.trim();
}
