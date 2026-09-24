import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtAuthUser } from '@inventory/shared';

/** Request-scoped user from JWT (use `userId`, not `id`). */
export type AuthUser = JwtAuthUser;

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
