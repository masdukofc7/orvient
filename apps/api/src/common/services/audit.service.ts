import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    organizationId?: string | null;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? undefined,
        userId: input.userId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        before: input.before as object | undefined,
        after: input.after as object | undefined,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  }
}
