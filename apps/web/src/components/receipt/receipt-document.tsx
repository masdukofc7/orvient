'use client';

import { formatDateTime, formatMoney, cn } from '@/lib/utils';
import { receiptPublicUrl } from '@/lib/receipt';
import { DEFAULT_CURRENCY } from '@inventory/shared';
import { Card, CardBody } from '@/components/ui/card';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { ReceiptQr } from '@/components/receipt/receipt-qr';

export type ReceiptItem = {
  id: string;
  name: string;
  quantity: string;
  quantityReturned?: string | number;
  unitPrice: string;
  lineTotal: string;
};

export type ReceiptOrg = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  taxId: string | null;
  logoUrl: string | null;
  brandColor: string;
};

export type ReceiptContact = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type ReceiptData = {
  id?: string;
  invoiceNumber: string;
  currency: string;
  subtotal: string;
  discount: string;
  taxAmount: string;
  grandTotal: string;
  paidAmount: string;
  notes: string | null;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  receiptToken: string;
  contact?: ReceiptContact | null;
  organization?: ReceiptOrg | null;
  items: ReceiptItem[];
};

export type ReceiptLayout = 'thermal' | 'a4';

function ContactLines({
  contact,
  className,
}: {
  contact?: ReceiptContact | null;
  className?: string;
}) {
  if (!contact) {
    return <div className={cn('text-sm', className)}>Walk-in customer</div>;
  }
  return (
    <div className={cn('space-y-0.5 text-sm', className)}>
      <div className="break-words font-medium">{contact.name}</div>
      {contact.phone ? (
        <div className="break-all text-muted-foreground">{contact.phone}</div>
      ) : null}
      {contact.email ? (
        <div className="break-all text-muted-foreground">{contact.email}</div>
      ) : null}
      {contact.address ? (
        <div className="break-words text-muted-foreground">{contact.address}</div>
      ) : null}
    </div>
  );
}

function CompanyHeader({
  org,
  large,
  align = 'start',
}: {
  org?: ReceiptOrg | null;
  large?: boolean;
  align?: 'start' | 'center';
}) {
  const name = org?.name ?? 'Company';
  return (
    <div
      className={cn(
        'flex gap-3',
        large && 'gap-4',
        align === 'center' ? 'flex-col items-center text-center' : 'items-start',
      )}
    >
      {org?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={org.logoUrl}
          alt=""
          className={cn(
            'shrink-0 object-contain',
            large ? 'h-14 w-14' : 'h-11 w-11 print:h-10 print:w-10',
          )}
        />
      ) : null}
      <div className={cn('min-w-0 space-y-0.5', align === 'center' && 'w-full')}>
        <div
          className={cn(
            'break-words font-semibold leading-tight',
            large ? 'text-xl sm:text-2xl' : 'text-base',
          )}
          style={org?.brandColor ? { color: org.brandColor } : undefined}
        >
          {name}
        </div>
        {org?.address ? (
          <div className="break-words text-xs text-muted-foreground">{org.address}</div>
        ) : null}
        <div
          className={cn(
            'flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground',
            align === 'center' && 'justify-center',
          )}
        >
          {org?.phone ? <span className="break-all">{org.phone}</span> : null}
          {org?.email ? <span className="break-all">{org.email}</span> : null}
          {org?.website ? <span className="break-all">{org.website}</span> : null}
        </div>
        {org?.taxId ? (
          <div className="text-xs text-muted-foreground">Tax ID: {org.taxId}</div>
        ) : null}
      </div>
    </div>
  );
}

function Totals({
  data,
  currency,
  balanceDue,
  className,
}: {
  data: ReceiptData;
  currency: string;
  balanceDue: number;
  className?: string;
}) {
  const row = (label: string, value: string, strong?: boolean) => (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        strong && 'border-t border-border pt-1.5 text-base font-semibold',
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className={cn('space-y-1.5 text-sm', className)}>
      {row('Subtotal', formatMoney(data.subtotal, currency))}
      {row('Discount', formatMoney(data.discount, currency))}
      {row('Tax', formatMoney(data.taxAmount, currency))}
      {row('Total', formatMoney(data.grandTotal, currency), true)}
      {row('Paid', formatMoney(data.paidAmount, currency))}
      {balanceDue > 0
        ? row('Balance due', formatMoney(balanceDue, currency), true)
        : null}
    </div>
  );
}

function ThermalLines({
  items,
  currency,
}: {
  items: ReceiptItem[];
  currency: string;
}) {
  if (!items.length) {
    return <p className="py-3 text-center text-sm text-muted-foreground">No line items</p>;
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.id} className="space-y-0.5 py-2.5">
          <div className="break-words text-sm font-medium leading-snug">{item.name}</div>
          <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums text-muted-foreground">
            <span className="min-w-0">
              {item.quantity} × {formatMoney(item.unitPrice, currency)}
            </span>
            <span className="shrink-0 font-medium text-foreground">
              {formatMoney(item.lineTotal, currency)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReceiptDocument({
  data,
  layout = 'thermal',
  className,
}: {
  data: ReceiptData;
  layout?: ReceiptLayout;
  className?: string;
}) {
  const balanceDue = Math.max(Number(data.grandTotal) - Number(data.paidAmount), 0);
  const publicUrl = receiptPublicUrl(data.receiptToken);
  const currency = data.currency || DEFAULT_CURRENCY;

  const a4Columns: SimpleColumn<ReceiptItem>[] = [
    {
      id: 'item',
      header: 'Item',
      className: 'min-w-0 max-w-[12rem] sm:max-w-none',
      cell: (item) => <span className="break-words font-medium">{item.name}</span>,
    },
    {
      id: 'qty',
      header: 'Qty',
      className: 'w-14 whitespace-nowrap text-right tabular-nums',
      cell: (item) => item.quantity,
    },
    {
      id: 'price',
      header: 'Price',
      hideOnMobile: true,
      className: 'whitespace-nowrap text-right tabular-nums',
      cell: (item) => formatMoney(item.unitPrice, currency),
    },
    {
      id: 'total',
      header: 'Total',
      className: 'whitespace-nowrap text-right tabular-nums',
      cell: (item) => formatMoney(item.lineTotal, currency),
    },
  ];

  if (layout === 'a4') {
    return (
      <Card
        data-print="a4"
        className={cn(
          'mx-auto w-full max-w-3xl overflow-hidden print:max-w-none print:border-0 print:shadow-none',
          className,
        )}
      >
        <CardBody className="space-y-6 p-4 sm:space-y-8 sm:p-6 md:p-8 print:space-y-6 print:p-0">
          <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1">
              <CompanyHeader org={data.organization} large />
            </div>
            <div className="shrink-0 space-y-0.5 sm:text-right">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Invoice
              </div>
              <div className="break-all text-lg font-semibold">{data.invoiceNumber}</div>
              {data.status === 'VOID' ? (
                <div className="font-semibold text-destructive">VOID</div>
              ) : null}
              <div className="text-sm text-muted-foreground">
                {formatDateTime(data.createdAt)}
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8">
            <div className="min-w-0">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bill to
              </div>
              <ContactLines contact={data.contact} />
            </div>
            <div className="flex flex-col items-center sm:items-end">
              <ReceiptQr url={publicUrl} size={88} />
            </div>
          </div>

          <SimpleTable
            columns={a4Columns}
            data={data.items}
            getRowKey={(row) => row.id}
            className="rounded-none border-0 shadow-none [&_thead]:static [&_thead]:bg-transparent [&_thead]:backdrop-blur-none"
            emptyTitle="No line items"
          />

          <div className="flex justify-stretch sm:justify-end">
            <Totals
              data={data}
              currency={currency}
              balanceDue={balanceDue}
              className="w-full rounded-lg bg-muted/40 p-3 sm:max-w-xs sm:bg-transparent sm:p-0"
            />
          </div>

          {data.notes ? (
            <div className="border-t border-border pt-4 text-sm">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              <p className="break-words text-muted-foreground">{data.notes}</p>
            </div>
          ) : null}

          <p className="pt-2 text-center text-xs text-muted-foreground">
            Thank you for your business
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card
      data-print="thermal"
      className={cn(
        'mx-auto w-full max-w-[22rem] overflow-hidden print:max-w-none print:border-0 print:shadow-none',
        className,
      )}
    >
      <CardBody className="space-y-4 p-4 print:p-0">
        <CompanyHeader org={data.organization} align="center" />

        <div className="space-y-0.5 border-y border-border py-3 text-center text-sm">
          <div className="break-all font-semibold">{data.invoiceNumber}</div>
          {data.status === 'VOID' ? (
            <div className="font-semibold text-destructive">VOID</div>
          ) : null}
          <div className="text-xs text-muted-foreground">{formatDateTime(data.createdAt)}</div>
        </div>

        <div>
          <div className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Bill to
          </div>
          <ContactLines contact={data.contact} className="text-center" />
        </div>

        <ThermalLines items={data.items} currency={currency} />

        <Totals data={data} currency={currency} balanceDue={balanceDue} />

        {data.notes ? (
          <p className="break-words text-center text-xs text-muted-foreground">{data.notes}</p>
        ) : null}

        <div className="flex flex-col items-center gap-1 border-t border-border pt-4">
          <ReceiptQr url={publicUrl} size={96} />
          <p className="text-center text-[10px] text-muted-foreground">Scan for digital receipt</p>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">Thank you</p>
      </CardBody>
    </Card>
  );
}
