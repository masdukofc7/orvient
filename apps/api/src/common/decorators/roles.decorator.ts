import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restrict route to these membership roles. Omit decorator → any authenticated user. */
export const Roles = (...roles: Array<'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER'>) =>
  SetMetadata(ROLES_KEY, roles);
