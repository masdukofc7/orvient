import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { BillingService } from '../../modules/billing/application/billing.service';

/** Paths that must work while billing is past due / unpaid. */
const BYPASS =
  /\/(billing|auth|platform|health|receipts)(\/|$)/i;

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const path = req.originalUrl || req.url || '';
    if (BYPASS.test(path)) return true;

    const orgId = req.user?.organizationId;
    if (!orgId) return true;

    await this.billing.assertOrgEntitled(orgId);
    return true;
  }
}
