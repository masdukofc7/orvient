/**
 * Permission matrix invariants.
 * Run: pnpm --filter @inventory/api exec tsx src/common/rbac.selfcheck.ts
 */
import assert from 'node:assert/strict';
import {
  MEMBERSHIP_ROLES,
  PERMISSION_ROLES,
  can,
  isOwnerAdminRole,
  isOwnerRole,
  isStaffRole,
  rolesFor,
  type Permission,
} from '@inventory/shared';

const permissions = Object.keys(PERMISSION_ROLES) as Permission[];

assert.ok(permissions.length > 0);
for (const p of permissions) {
  const roles = rolesFor(p);
  assert.ok(roles.length > 0, `${p} must allow at least one role`);
  for (const r of roles) {
    assert.ok((MEMBERSHIP_ROLES as readonly string[]).includes(r), `${p}: bad role ${r}`);
    assert.equal(can(r, p), true);
  }
  assert.equal(can('CASHIER', p), roles.includes('CASHIER'));
}

assert.equal(isStaffRole('MANAGER'), true);
assert.equal(isStaffRole('CASHIER'), false);
assert.equal(isOwnerAdminRole('ADMIN'), true);
assert.equal(isOwnerAdminRole('MANAGER'), false);
assert.equal(isOwnerRole('OWNER'), true);
assert.equal(can('CASHIER', 'invoices.finalize'), true);
assert.equal(can('CASHIER', 'inventory.manage'), false);
assert.equal(can('MANAGER', 'team.manage'), false);
assert.equal(can('ADMIN', 'billing.manage'), true);

console.log('rbac.selfcheck ok');
