import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private enabled = true;
  private unavailable = false;

  constructor() {
    if (process.env.REDIS_DISABLED === 'true') {
      this.enabled = false;
      this.logger.warn('Redis disabled via REDIS_DISABLED=true');
      return;
    }

    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      retryStrategy: () => null,
    });

    this.client.on('error', () => {
      if (!this.unavailable) {
        this.unavailable = true;
        this.logger.warn('Redis unavailable — continuing without cache');
      }
    });
  }

  private async connect() {
    if (!this.enabled || !this.client || this.unavailable) return false;
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      this.unavailable = false;
      return true;
    } catch {
      this.unavailable = true;
      return false;
    }
  }

  async get(key: string) {
    if (!(await this.connect()) || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      this.unavailable = true;
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (!(await this.connect()) || !this.client) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
        return;
      }
      await this.client.set(key, value);
    } catch {
      this.unavailable = true;
    }
  }

  /** Atomic incr; sets TTL on first hit. Returns 0 when Redis is down. */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (!(await this.connect()) || !this.client) return 0;
    try {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, ttlSeconds);
      return n;
    } catch {
      this.unavailable = true;
      return 0;
    }
  }

  async del(key: string) {
    if (!(await this.connect()) || !this.client) return;
    try {
      await this.client.del(key);
    } catch {
      this.unavailable = true;
    }
  }

  /** @returns 'disabled' | 'ok' | 'error' */
  async ping(): Promise<'disabled' | 'ok' | 'error'> {
    if (!this.enabled) return 'disabled';
    if (!(await this.connect()) || !this.client) return 'error';
    try {
      const pong = await this.client.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      this.unavailable = true;
      return 'error';
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    await this.client.quit().catch(() => undefined);
  }
}
