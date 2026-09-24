'use client';

import {
  contactTypeLabel,
  invoiceStatusLabel,
  inventoryTxnTypeLabel,
  paymentStatusLabel,
  productStatusLabel,
  purchaseOrderStatusLabel,
} from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

function variantForStatus(kind: string, value: string): BadgeProps['variant'] {
  const v = value.toUpperCase();
  if (kind === 'product') {
    if (v === 'ACTIVE') return 'success';
    if (v === 'INACTIVE') return 'muted';
    if (v === 'DISCONTINUED') return 'danger';
  }
  if (kind === 'invoice') {
    if (v === 'FINALIZED') return 'success';
    if (v === 'DRAFT') return 'warning';
    if (v === 'VOID') return 'danger';
  }
  if (kind === 'payment') {
    if (v === 'PAID') return 'success';
    if (v === 'PARTIAL') return 'warning';
    if (v === 'UNPAID') return 'danger';
    if (v === 'VOID') return 'muted';
  }
  if (kind === 'contact') {
    if (v === 'CUSTOMER') return 'info';
    if (v === 'SUPPLIER') return 'default';
  }
  if (kind === 'inventory') {
    if (v === 'STOCK_IN') return 'success';
    if (v === 'STOCK_OUT' || v === 'SALE') return 'warning';
    if (v === 'SALE_VOID') return 'danger';
    if (v === 'ADJUSTMENT') return 'info';
  }
  if (kind === 'purchaseOrder') {
    if (v === 'RECEIVED') return 'success';
    if (v === 'PARTIAL') return 'warning';
    if (v === 'ORDERED') return 'info';
    if (v === 'CANCELLED') return 'muted';
  }
  return 'default';
}

export function ContactTypeBadge({ value }: { value: string }) {
  return <Badge variant={variantForStatus('contact', value)}>{contactTypeLabel(value)}</Badge>;
}

export function ProductStatusBadge({ value }: { value: string }) {
  return <Badge variant={variantForStatus('product', value)}>{productStatusLabel(value)}</Badge>;
}

export function InvoiceStatusBadge({ value }: { value: string }) {
  return <Badge variant={variantForStatus('invoice', value)}>{invoiceStatusLabel(value)}</Badge>;
}

export function PaymentStatusBadge({ value }: { value: string }) {
  return <Badge variant={variantForStatus('payment', value)}>{paymentStatusLabel(value)}</Badge>;
}

export function InventoryTxnBadge({ value }: { value: string }) {
  return (
    <Badge variant={variantForStatus('inventory', value)}>{inventoryTxnTypeLabel(value)}</Badge>
  );
}

export function PurchaseOrderStatusBadge({ value }: { value: string }) {
  return (
    <Badge variant={variantForStatus('purchaseOrder', value)}>
      {purchaseOrderStatusLabel(value)}
    </Badge>
  );
}

export function InvoicePaymentBadges({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <InvoiceStatusBadge value={status} />
      <PaymentStatusBadge value={paymentStatus} />
    </div>
  );
}
