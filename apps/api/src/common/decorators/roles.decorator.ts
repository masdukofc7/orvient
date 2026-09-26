import { SetMetadata } from '@nestjs/common';
import type { MembershipRoleName, Permission } from '@inventory/shared';
import { rolesFor } from '@inventory/shared';

export const ROLES_KEY = 'roles';

/** Restrict route to these membership roles. Omit decorator → any authenticated user. */
export const Roles = (...roles: MembershipRoleName[]) => SetMetadata(ROLES_KEY, roles);

/** Prefer this — roles come from the shared permission matrix. */
export const RequirePermission = (permission: Permission) => Roles(...rolesFor(permission));
