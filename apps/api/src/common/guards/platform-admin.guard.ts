import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(PLATFORM_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    return Boolean(user?.isPlatformAdmin);
  }
}
