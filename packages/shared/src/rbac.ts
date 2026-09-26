/**
 * Org RBAC — single source of truth.
 * Roles are fixed bundles; Role.permissions JSON is unused metadata.
 * Platform ops use PlatformRole + @PlatformAdmin (separate axis).
 */

export type MembershipRoleName = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER';

export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'] as const;

export type Permission =
  | 'org.update'
  | 'org.logo'
  | 'branches.manage'
  | 'team.manage'
  | 'billing.manage'
  | 'products.write'
  | 'inventory.manage'
  | 'purchase_orders.manage'
  | 'contacts.delete'
  | 'invoices.void'
  | 'invoices.return'
  | 'invoices.finalize';

const STAFF: readonly MembershipRoleName[] = ['OWNER', 'ADMIN', 'MANAGER'];
const OWNER_ADMIN: readonly MembershipRoleName[] = ['OWNER', 'ADMIN'];
const ALL: readonly MembershipRoleName[] = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER'];

/** permission → roles allowed (API + UI must both use this). */
export const PERMISSION_ROLES: Record<Permission, readonly MembershipRoleName[]> = {
  'org.update': STAFF,
  'org.logo': STAFF,
  'branches.manage': OWNER_ADMIN,
  'team.manage': OWNER_ADMIN,
  'billing.manage': OWNER_ADMIN,
  'products.write': STAFF,
  'inventory.manage': STAFF,
  'purchase_orders.manage': STAFF,
  'contacts.delete': STAFF,
  'invoices.void': STAFF,
  'invoices.return': STAFF,
  'invoices.finalize': ALL,
};

export function rolesFor(permission: Permission): MembershipRoleName[] {
  return [...PERMISSION_ROLES[permission]];
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSION_ROLES[permission] as readonly string[]).includes(role);
}

/** OWNER | ADMIN | MANAGER — stock, catalog, org profile. */
export function isStaffRole(role?: string | null) {
  return can(role, 'inventory.manage');
}

/** OWNER | ADMIN — team, branches, billing. */
export function isOwnerAdminRole(role?: string | null) {
  return can(role, 'team.manage');
}

export function isOwnerRole(role?: string | null) {
  return role === 'OWNER';
}
