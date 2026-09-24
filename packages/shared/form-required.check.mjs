import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const {
  createContactSchema,
  stockOutSchema,
  stockAdjustSchema,
  updateOrganizationSchema,
} = createRequire(import.meta.url)('./dist/index.js');

assert.ok(
  createContactSchema.safeParse({ name: 'Walk-in', type: 'CUSTOMER' }).success,
);
assert.equal(
  createContactSchema.safeParse({ name: 'Acme', type: 'SUPPLIER' }).success,
  false,
);
assert.ok(
  createContactSchema.safeParse({
    name: 'Acme',
    type: 'SUPPLIER',
    phone: '+8801',
  }).success,
);

assert.equal(stockOutSchema.safeParse({ productId: 'p1', quantity: 1 }).success, false);
assert.ok(
  stockOutSchema.safeParse({ productId: 'p1', quantity: 1, notes: 'damaged' }).success,
);
assert.equal(
  stockAdjustSchema.safeParse({ productId: 'p1', quantity: -1 }).success,
  false,
);
assert.ok(
  stockAdjustSchema.safeParse({ productId: 'p1', quantity: -1, notes: 'count' }).success,
);

assert.equal(
  updateOrganizationSchema.safeParse({ email: '', phone: '', address: '' }).success,
  false,
);
assert.equal(
  updateOrganizationSchema.safeParse({
    email: 'a@b.co',
    phone: '',
    address: '',
  }).success,
  false,
);
assert.ok(
  updateOrganizationSchema.safeParse({
    email: 'a@b.co',
    phone: '',
    address: 'Dhaka',
  }).success,
);
assert.ok(updateOrganizationSchema.safeParse({ brandColor: '#18181b' }).success);

console.log('form-required: ok');
