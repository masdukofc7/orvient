import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@inventory/database';

/** Cap pool size for Neon/serverless poolers (override with PRISMA_CONNECTION_LIMIT). */
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  const limit = process.env.PRISMA_CONNECTION_LIMIT?.trim() || '10';
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: { url: withPoolLimit(process.env.DATABASE_URL) },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
