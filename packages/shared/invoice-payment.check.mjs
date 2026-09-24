import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { resolveInvoicePayment, applyInvoicePayment } = createRequire(import.meta.url)(
  './dist/index.js',
);

assert.deepEqual(resolveInvoicePayment('UNPAID', 50, 100), {
  paymentStatus: 'UNPAID',
  paidAmount: 0,
});
assert.deepEqual(resolveInvoicePayment('PAID', undefined, 100), {
  paymentStatus: 'PAID',
  paidAmount: 100,
});
assert.deepEqual(resolveInvoicePayment('PARTIAL', 40, 100), {
  paymentStatus: 'PARTIAL',
  paidAmount: 40,
});
assert.throws(() => resolveInvoicePayment('PARTIAL', 0, 100));
assert.throws(() => resolveInvoicePayment('PARTIAL', 100, 100));

assert.deepEqual(applyInvoicePayment(0, 40, 100), {
  paidAmount: 40,
  paymentStatus: 'PARTIAL',
});
assert.deepEqual(applyInvoicePayment(60, 50, 100), {
  paidAmount: 100,
  paymentStatus: 'PAID',
});

console.log('invoice payment helpers: ok');
