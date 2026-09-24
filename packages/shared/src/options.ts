export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

/** Humanize enum-like values: STOCK_IN → Stock in */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function labelFor(
  options: ReadonlyArray<SelectOption>,
  value: string | null | undefined,
  fallback = humanizeEnum,
): string {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? fallback(value);
}

export const CONTACT_TYPES = ['CUSTOMER', 'SUPPLIER'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_OPTIONS: SelectOption<ContactType>[] = [
  { value: 'CUSTOMER', label: 'Customer', description: 'Buys from you' },
  { value: 'SUPPLIER', label: 'Supplier', description: 'Sells to you' },
];

export function contactTypeLabel(value: string | null | undefined) {
  return labelFor(CONTACT_TYPE_OPTIONS, value);
}

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_OPTIONS: SelectOption<ProductStatus>[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DISCONTINUED', label: 'Discontinued' },
];

export function productStatusLabel(value: string | null | undefined) {
  return labelFor(PRODUCT_STATUS_OPTIONS, value);
}

export const INVOICE_STATUSES = ['DRAFT', 'FINALIZED', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_OPTIONS: SelectOption<InvoiceStatus>[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'VOID', label: 'Void' },
];

export function invoiceStatusLabel(value: string | null | undefined) {
  return labelFor(INVOICE_STATUS_OPTIONS, value);
}

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'VOID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_OPTIONS: SelectOption<PaymentStatus>[] = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
];

export function paymentStatusLabel(value: string | null | undefined) {
  return labelFor(PAYMENT_STATUS_OPTIONS, value);
}

export const PURCHASE_ORDER_STATUSES = ['ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUS_OPTIONS: SelectOption<PurchaseOrderStatus>[] = [
  { value: 'ORDERED', label: 'Ordered' },
  { value: 'PARTIAL', label: 'Partially received' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function purchaseOrderStatusLabel(value: string | null | undefined) {
  return labelFor(PURCHASE_ORDER_STATUS_OPTIONS, value);
}

export const INVENTORY_TXN_TYPES = [
  'STOCK_IN',
  'STOCK_OUT',
  'ADJUSTMENT',
  'SALE',
  'SALE_VOID',
] as const;
export type InventoryTxnType = (typeof INVENTORY_TXN_TYPES)[number];

export const INVENTORY_TXN_TYPE_OPTIONS: SelectOption<InventoryTxnType>[] = [
  { value: 'STOCK_IN', label: 'Stock in' },
  { value: 'STOCK_OUT', label: 'Stock out' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'SALE', label: 'Sale' },
  { value: 'SALE_VOID', label: 'Sale void' },
];

export function inventoryTxnTypeLabel(value: string | null | undefined) {
  return labelFor(INVENTORY_TXN_TYPE_OPTIONS, value);
}

export const PRODUCT_UNITS = [
  'pcs',
  'kg',
  'g',
  'ltr',
  'ml',
  'm',
  'box',
  'pack',
  'dozen',
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_OPTIONS: SelectOption[] = [
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'ltr', label: 'Liter (ltr)' },
  { value: 'ml', label: 'Milliliter (ml)' },
  { value: 'm', label: 'Meter (m)' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
  { value: 'dozen', label: 'Dozen' },
];

export type CurrencyOption = SelectOption & { symbol: string; name: string };

/** Common storefront currencies — BDT first as product default */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { value: 'BDT', label: 'BDT — Bangladeshi Taka', name: 'Bangladeshi Taka', symbol: '৳' },
  { value: 'USD', label: 'USD — US Dollar', name: 'US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR — Euro', name: 'Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP — British Pound', name: 'British Pound', symbol: '£' },
  { value: 'INR', label: 'INR — Indian Rupee', name: 'Indian Rupee', symbol: '₹' },
  { value: 'AED', label: 'AED — UAE Dirham', name: 'UAE Dirham', symbol: 'د.إ' },
  { value: 'SAR', label: 'SAR — Saudi Riyal', name: 'Saudi Riyal', symbol: '﷼' },
  { value: 'SGD', label: 'SGD — Singapore Dollar', name: 'Singapore Dollar', symbol: 'S$' },
  { value: 'MYR', label: 'MYR — Malaysian Ringgit', name: 'Malaysian Ringgit', symbol: 'RM' },
  { value: 'AUD', label: 'AUD — Australian Dollar', name: 'Australian Dollar', symbol: 'A$' },
  { value: 'CAD', label: 'CAD — Canadian Dollar', name: 'Canadian Dollar', symbol: 'C$' },
  { value: 'JPY', label: 'JPY — Japanese Yen', name: 'Japanese Yen', symbol: '¥' },
  { value: 'CNY', label: 'CNY — Chinese Yuan', name: 'Chinese Yuan', symbol: '¥' },
];

export const DEFAULT_CURRENCY = 'BDT';

export function currencyLabel(code: string | null | undefined) {
  return labelFor(CURRENCY_OPTIONS, code, (v) => v?.toUpperCase() ?? '—');
}

export function currencySymbol(code: string | null | undefined) {
  if (!code) return '';
  return CURRENCY_OPTIONS.find((c) => c.value === code.toUpperCase())?.symbol ?? code;
}

export function ensureCurrencyOption(code: string | null | undefined): CurrencyOption[] {
  const normalized = (code ?? DEFAULT_CURRENCY).toUpperCase();
  if (CURRENCY_OPTIONS.some((c) => c.value === normalized)) return CURRENCY_OPTIONS;
  return [
    {
      value: normalized,
      label: `${normalized} — Custom`,
      name: normalized,
      symbol: normalized,
    },
    ...CURRENCY_OPTIONS,
  ];
}
