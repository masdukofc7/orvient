import assert from 'node:assert/strict';
import { assertPdfBuffer, buildReceiptPdf } from './receipt-pdf';

async function selfcheck() {
  const buf = await buildReceiptPdf({
    invoiceNumber: 'INV-000001',
    currency: 'BDT',
    subtotal: 100,
    discount: 0,
    taxAmount: 0,
    grandTotal: 100,
    paidAmount: 100,
    notes: null,
    status: 'FINALIZED',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    contact: { name: 'Walk-in', phone: null, email: null },
    organization: {
      name: 'Test Shop',
      phone: null,
      email: null,
      address: 'Dhaka',
      taxId: null,
    },
    items: [{ name: 'Item A', quantity: 1, unitPrice: 100, lineTotal: 100 }],
  });
  assertPdfBuffer(buf);
  assert.ok(buf.length > 100);
  console.log('receipt-pdf.selfcheck ok');
}

void selfcheck();
