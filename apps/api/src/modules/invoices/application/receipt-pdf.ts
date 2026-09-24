import PDFDocument from 'pdfkit';

export type ReceiptPdfInvoice = {
  invoiceNumber: string;
  currency: string;
  subtotal: { toString(): string } | string | number;
  discount: { toString(): string } | string | number;
  taxAmount: { toString(): string } | string | number;
  grandTotal: { toString(): string } | string | number;
  paidAmount: { toString(): string } | string | number;
  notes: string | null;
  status: string;
  createdAt: Date | string;
  contact?: {
    name: string;
    phone: string | null;
    email: string | null;
    address?: string | null;
  } | null;
  organization?: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxId: string | null;
  } | null;
  items: Array<{
    name: string;
    quantity: { toString(): string } | string | number;
    unitPrice: { toString(): string } | string | number;
    lineTotal: { toString(): string } | string | number;
  }>;
};

function money(value: { toString(): string } | string | number, currency: string) {
  const n = Number(typeof value === 'object' ? value.toString() : value);
  const formatted = Number.isFinite(n) ? n.toFixed(2) : '0.00';
  return `${currency} ${formatted}`;
}

function str(value: { toString(): string } | string | number) {
  return typeof value === 'object' ? value.toString() : String(value);
}

/** A4 invoice PDF for download / formal records. */
export function buildReceiptPdf(invoice: ReceiptPdfInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const org = invoice.organization;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    doc.fontSize(16).font('Helvetica-Bold').text(org?.name ?? 'Invoice', left, 48, { width: width * 0.55 });
    doc.font('Helvetica').fontSize(9);
    if (org?.address) doc.text(org.address, { width: width * 0.55 });
    if (org?.phone) doc.text(org.phone, { width: width * 0.55 });
    if (org?.email) doc.text(org.email, { width: width * 0.55 });
    if (org?.taxId) doc.text(`Tax ID: ${org.taxId}`, { width: width * 0.55 });

    const metaTop = 48;
    doc.font('Helvetica').fontSize(9).fillColor('#555').text('INVOICE', left + width * 0.55, metaTop, {
      width: width * 0.45,
      align: 'right',
    });
    doc
      .fillColor('black')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(invoice.invoiceNumber, left + width * 0.55, metaTop + 14, {
        width: width * 0.45,
        align: 'right',
      });
    if (invoice.status === 'VOID') {
      doc.fillColor('red').fontSize(11).text('VOID', left + width * 0.55, metaTop + 30, {
        width: width * 0.45,
        align: 'right',
      });
      doc.fillColor('black');
    }
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(new Date(invoice.createdAt).toLocaleString(), left + width * 0.55, metaTop + 46, {
        width: width * 0.45,
        align: 'right',
      });

    doc.moveDown(2);
    const billY = Math.max(doc.y, metaTop + 70);
    doc.y = billY;
    doc.fontSize(8).fillColor('#555').text('BILL TO');
    doc.fillColor('black').fontSize(10).font('Helvetica-Bold');
    doc.text(invoice.contact?.name ?? 'Walk-in customer');
    doc.font('Helvetica').fontSize(9);
    if (invoice.contact?.phone) doc.text(invoice.contact.phone);
    if (invoice.contact?.email) doc.text(invoice.contact.email);
    if (invoice.contact?.address) doc.text(invoice.contact.address);

    doc.moveDown(1.2);
    const tableTop = doc.y;
    const cols = {
      item: left,
      qty: left + width * 0.48,
      price: left + width * 0.62,
      total: left + width * 0.8,
    };
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', cols.item, tableTop, { width: width * 0.46 });
    doc.text('Qty', cols.qty, tableTop, { width: width * 0.12 });
    doc.text('Price', cols.price, tableTop, { width: width * 0.16 });
    doc.text('Total', cols.total, tableTop, { width: width * 0.2, align: 'right' });
    doc
      .moveTo(left, tableTop + 14)
      .lineTo(right, tableTop + 14)
      .strokeColor('#ccc')
      .stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9).strokeColor('#000');
    for (const item of invoice.items) {
      const nameHeight = doc.heightOfString(item.name, { width: width * 0.46 });
      const rowH = Math.max(14, nameHeight);
      if (y + rowH > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.text(item.name, cols.item, y, { width: width * 0.46 });
      doc.text(str(item.quantity), cols.qty, y, { width: width * 0.12 });
      doc.text(money(item.unitPrice, invoice.currency), cols.price, y, { width: width * 0.16 });
      doc.text(money(item.lineTotal, invoice.currency), cols.total, y, {
        width: width * 0.2,
        align: 'right',
      });
      y += rowH + 6;
    }

    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor('#ccc')
      .stroke();
    y += 12;

    const totalsX = left + width * 0.55;
    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(label, totalsX, y, { width: width * 0.22 });
      doc.text(value, totalsX + width * 0.22, y, { width: width * 0.23, align: 'right' });
      y += 16;
    };
    line('Subtotal', money(invoice.subtotal, invoice.currency));
    line('Discount', money(invoice.discount, invoice.currency));
    line('Tax', money(invoice.taxAmount, invoice.currency));
    line('Total', money(invoice.grandTotal, invoice.currency), true);
    line('Paid', money(invoice.paidAmount, invoice.currency));
    const balance = Math.max(Number(str(invoice.grandTotal)) - Number(str(invoice.paidAmount)), 0);
    if (balance > 0) line('Balance due', money(balance, invoice.currency), true);

    if (invoice.notes) {
      y += 8;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555').text('NOTES', left, y);
      y += 12;
      doc.fillColor('black').font('Helvetica').fontSize(9).text(invoice.notes, left, y, { width });
    }

    doc
      .fontSize(9)
      .fillColor('#555')
      .text('Thank you for your business', left, doc.page.height - 64, {
        width,
        align: 'center',
      });
    doc.end();
  });
}

// ponytail: smoke check — PDF magic bytes; expand if layout regressions show up
export function assertPdfBuffer(buf: Buffer) {
  if (buf.length < 5 || buf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('buildReceiptPdf did not produce a PDF');
  }
}
