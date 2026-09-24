import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.redis.ping();
    // Redis is cache-only; unavailable cache is degraded, not down.
    const status = redis === 'error' ? 'degraded' : 'ok';
    if (status === 'ok') {
      return { status, postgres: 'ok', redis, timestamp: new Date().toISOString() };
    }
    // Still 200 so load balancers don't kill the API when Redis flaps.
    return { status, postgres: 'ok', redis, timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', postgres: 'error' });
    }
    return { status: 'ready', postgres: 'ok', timestamp: new Date().toISOString() };
  }
}
