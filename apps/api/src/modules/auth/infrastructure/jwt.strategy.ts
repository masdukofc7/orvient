import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { OrganizationStatus, PlatformRole } from '@inventory/database';
import type { JwtAuthUser } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { resolveJwtAccessSecret } from './jwt-secrets';

type JwtPayload = {
  sub: string;
  email: string;
  organizationId: string;
  membershipRole: string;
  branchId?: string | null;
};

function cookieExtractor(req: Request): string | null {
  const token = req?.cookies?.accessToken;
  return typeof token === 'string' && token.length ? token : null;
}

const CACHE_TTL_SEC = 45;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtAccessSecret(config),
      passReqToCallback: true,
    });
  }

  // ponytail: Redis cache 45s; bump TTL or drop if suspend must be instant.
  async validate(req: Request, payload: JwtPayload): Promise<JwtAuthUser> {
    const path = req.originalUrl || req.url || '';
    const skipOrg = path.includes('/platform');
    const cacheKey = `jwt:v1:${payload.sub}:${payload.organizationId}:${skipOrg ? 1 : 0}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as JwtAuthUser;
      } catch {
        /* fall through */
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, platformRole: true, email: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('User inactive');

    if (!skipOrg) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: payload.sub,
            organizationId: payload.organizationId,
          },
        },
        select: { isActive: true },
      });
      if (!membership?.isActive) {
        throw new UnauthorizedException('Membership inactive');
      }

      const org = await this.prisma.organization.findUnique({
        where: { id: payload.organizationId },
        select: { status: true },
      });
      if (!org || org.status !== OrganizationStatus.ACTIVE) {
        throw new UnauthorizedException('Organization is suspended');
      }
    }

    const authUser: JwtAuthUser = {
      userId: payload.sub,
      email: user.email,
      organizationId: payload.organizationId,
      membershipRole: payload.membershipRole,
      branchId: payload.branchId,
      platformRole: user.platformRole,
      isPlatformAdmin: user.platformRole !== PlatformRole.NONE,
    };

    await this.redis.set(cacheKey, JSON.stringify(authUser), CACHE_TTL_SEC);
    return authUser;
  }
}
