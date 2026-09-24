import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { OrganizationStatus, PlatformRole } from '@inventory/database';
import type { JwtAuthUser } from '@inventory/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
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

  // ponytail: one user + org read per request so suspend/deactivate/demote apply before the access token expires.
  async validate(req: Request, payload: JwtPayload): Promise<JwtAuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, platformRole: true, email: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('User inactive');

    const path = req.originalUrl || req.url || '';
    if (!path.includes('/platform')) {
      const org = await this.prisma.organization.findUnique({
        where: { id: payload.organizationId },
        select: { status: true },
      });
      if (!org || org.status !== OrganizationStatus.ACTIVE) {
        throw new UnauthorizedException('Organization is suspended');
      }
    }

    return {
      userId: payload.sub,
      email: user.email,
      organizationId: payload.organizationId,
      membershipRole: payload.membershipRole,
      branchId: payload.branchId,
      platformRole: user.platformRole,
      isPlatformAdmin: user.platformRole !== PlatformRole.NONE,
    };
  }
}
