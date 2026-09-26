import { z } from 'zod';

export * from './options';

export const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/)
  .transform((v) => v.toUpperCase());

export const moneySchema = z.coerce.number().finite().nonnegative();
export const quantitySchema = z.coerce.number().finite();

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  search: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationId: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().trim().min(1).max(200),
  defaultCurrency: currencyCodeSchema.optional().default('BDT'),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const billingCycleSchema = z.enum(['MONTHLY', 'YEARLY']);
export const subscriptionStatusSchema = z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']);

export const billingCheckoutSchema = z.object({
  planId: z.string().min(1),
  billingCycle: billingCycleSchema.default('MONTHLY'),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

export const billingManualRequestSchema = z.object({
  planId: z.string().min(1),
  billingCycle: billingCycleSchema.default('MONTHLY'),
  method: z.string().trim().min(1).max(100),
  proofRef: z.string().trim().min(1).max(500),
  note: z.string().trim().max(2000).optional(),
});

export type BillingManualRequestInput = z.infer<typeof billingManualRequestSchema>;

export const platformBillingReviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectReason: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'REJECTED' && !v.rejectReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rejectReason is required when rejecting',
        path: ['rejectReason'],
      });
    }
  });

export type PlatformBillingReviewInput = z.infer<typeof platformBillingReviewSchema>;

export const billingCheckoutSyncSchema = z.object({
  requestId: z.string().min(1),
  attemptId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
});

export type BillingCheckoutSyncInput = z.infer<typeof billingCheckoutSyncSchema>;

export const CHECKOUT_TTL_MINUTES = 60;
export const TRIAL_DAYS = 14;
export const PAST_DUE_GRACE_DAYS = 3;

export const switchOrgSchema = z.object({
  organizationId: z.string().min(1),
});

export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;

export const switchBranchSchema = z.object({
  branchId: z.string().min(1),
});

export type SwitchBranchInput = z.infer<typeof switchBranchSchema>;

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();

export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export type AuthMembershipOption = {
  organizationId: string;
  organizationName: string;
  slug: string;
  membershipRole: string;
};

export const productStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']);
export const contactTypeSchema = z.enum(['CUSTOMER', 'SUPPLIER']);

export const productListQuerySchema = paginationQuerySchema.extend({
  status: productStatusSchema.optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const contactListQuerySchema = paginationQuerySchema.extend({
  type: contactTypeSchema.optional(),
});

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'FINALIZED', 'VOID']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID', 'VOID']).optional(),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const purchaseOrderListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED']).optional(),
});

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export const ledgerQuerySchema = paginationQuerySchema.extend({
  productId: z.string().optional(),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

/** Client session user returned by login / refresh / me */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  defaultCurrency?: string;
  brandColor?: string;
  membershipRole?: string;
  branchId?: string | null;
  /** Derived: platformRole is SUPPORT or OWNER. */
  isPlatformAdmin?: boolean;
  platformRole?: 'NONE' | 'SUPPORT' | 'OWNER';
};

export type LoginSuccess = {
  accessToken: string;
  user: SessionUser;
};

export type LoginOrgChoice = {
  requiresOrgChoice: true;
  memberships: AuthMembershipOption[];
};

/** JWT payload mapped onto Nest request.user */
export type JwtAuthUser = {
  userId: string;
  email: string;
  organizationId: string;
  membershipRole: string;
  branchId?: string | null;
  isPlatformAdmin?: boolean;
  platformRole?: 'NONE' | 'SUPPORT' | 'OWNER';
};

export type MembershipRoleName = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER';

export function isStaffRole(role?: string | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

export function isOwnerAdminRole(role?: string | null) {
  return role === 'OWNER' || role === 'ADMIN';
}

export const organizationStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

export const platformOrgListQuerySchema = paginationQuerySchema.extend({
  status: organizationStatusSchema.optional(),
});

export type PlatformOrgListQuery = z.infer<typeof platformOrgListQuerySchema>;

export const platformRoleSchema = z.enum(['NONE', 'SUPPORT', 'OWNER']);

export const platformUpdateOrgSchema = z
  .object({
    status: organizationStatusSchema.optional(),
    reason: z.string().trim().max(500).optional(),
    internalNote: z.string().max(4000).optional(),
  })
  .refine((d) => d.status !== undefined || d.internalNote !== undefined, {
    message: 'Nothing to update',
  })
  .refine((d) => d.status !== 'SUSPENDED' || Boolean(d.reason?.length), {
    message: 'Reason is required to suspend',
    path: ['reason'],
  });

export type PlatformUpdateOrgInput = z.infer<typeof platformUpdateOrgSchema>;

export const platformUserListQuerySchema = paginationQuerySchema;

export type PlatformUserListQuery = z.infer<typeof platformUserListQuerySchema>;

export const platformUpdateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    platformRole: platformRoleSchema.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.isActive !== undefined || d.platformRole !== undefined, {
    message: 'Nothing to update',
  })
  .refine((d) => d.isActive !== false || Boolean(d.reason?.length), {
    message: 'Reason is required to deactivate',
    path: ['reason'],
  });

export type PlatformUpdateUserInput = z.infer<typeof platformUpdateUserSchema>;

/** Blank/null barcode → use SKU (create-time default). */
export function resolveProductBarcode(
  barcode: string | null | undefined,
  sku: string,
): string {
  const trimmed = barcode?.trim();
  return trimmed || sku;
}

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  barcode: z.string().trim().min(1).max(64).optional().nullable(),
  sku: z.string().trim().min(1).max(64),
  category: z.string().trim().max(120).optional().nullable(),
  costPrice: moneySchema,
  sellingPrice: moneySchema,
  stock: z.coerce.number().finite().nonnegative().default(0),
  lowStockAt: z.coerce.number().finite().nonnegative().default(5),
  unit: z.string().trim().min(1).max(32).default('pcs'),
  status: productStatusSchema.default('ACTIVE'),
});

/** Stock is ledger-owned — never update via product PATCH */
export const updateProductSchema = createProductSchema
  .omit({ stock: true })
  .partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

const contactFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.union([z.string().trim().max(32), z.literal(''), z.null()]).optional(),
  address: z.union([z.string().trim().max(500), z.literal(''), z.null()]).optional(),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  type: contactTypeSchema,
});

function hasReachableContact(phone?: string | null, email?: string | null) {
  return Boolean(phone?.trim()) || Boolean(email?.trim());
}

/** Suppliers need a phone or email; customers may be name-only (POS walk-in). */
function refineSupplierReachable(
  data: { type?: string; phone?: string | null; email?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.type !== 'SUPPLIER') return;
  if (hasReachableContact(data.phone, data.email)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Supplier requires phone or email',
    path: ['phone'],
  });
}

export const createContactSchema = contactFieldsSchema.superRefine(refineSupplierReachable);

export const updateContactSchema = contactFieldsSchema
  .partial()
  .superRefine(refineSupplierReachable);

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const inventoryTxnTypeSchema = z.enum([
  'STOCK_IN',
  'STOCK_OUT',
  'ADJUSTMENT',
  'SALE',
  'SALE_VOID',
]);

export const stockMutationSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
  unitCost: moneySchema.optional().nullable(),
  branchId: z.string().optional().nullable(),
  /** Supplier for stock-in receive */
  contactId: z.string().optional().nullable(),
});

/** Stock-out requires a reason for the audit trail. */
export const stockOutSchema = stockMutationSchema.extend({
  notes: z.string().trim().min(1).max(500),
});

export const stockAdjustSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().finite(),
  notes: z.string().trim().min(1).max(500),
  branchId: z.string().optional().nullable(),
});

export const invoiceItemInputSchema = z.object({
  productId: z.string().optional().nullable(),
  name: z.string().trim().min(1),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  quantity: z.coerce.number().finite().positive(),
  unitPrice: moneySchema,
  costPrice: moneySchema.optional().default(0),
  discount: moneySchema.optional().default(0),
  taxRate: z.coerce.number().finite().nonnegative().optional().default(0),
});

export const createInvoiceSchema = z.object({
  contactId: z.string().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  exchangeRate: z.coerce.number().finite().positive().optional().default(1),
  discount: moneySchema.optional().default(0),
  taxRate: z.coerce.number().finite().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional().default('PAID'),
  paidAmount: moneySchema.optional(),
  branchId: z.string().optional().nullable(),
  /** Save as DRAFT quote — no stock movement until finalize. */
  asQuote: z.boolean().optional().default(false),
  items: z.array(invoiceItemInputSchema).min(1),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const purchaseOrderItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
  unitCost: moneySchema,
});

export const createPurchaseOrderSchema = z.object({
  contactId: z.string().min(1),
  currency: currencyCodeSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  branchId: z.string().optional().nullable(),
  items: z.array(purchaseOrderItemInputSchema).min(1),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const receivePurchaseOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().finite().positive(),
      }),
    )
    .min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

/** Positive payment amount for recording against an invoice. */
export const recordPaymentSchema = z.object({
  amount: z.coerce.number().finite().positive(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const posQuickSaleSchema = z.object({
  contactId: z.string().optional().nullable(),
  currency: currencyCodeSchema.optional(),
  discount: moneySchema.optional().default(0),
  taxRate: z.coerce.number().finite().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z
    .array(
      z.object({
        barcode: z.string().optional(),
        productId: z.string().optional(),
        quantity: z.coerce.number().finite().positive().default(1),
      }),
    )
    .min(1),
});

export type PosQuickSaleInput = z.infer<typeof posQuickSaleSchema>;

export const reportRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const optionalBlankString = (schema: z.ZodString) =>
  z.union([schema, z.literal(''), z.null()]).optional();

function blankToEmpty(v: string | null | undefined) {
  if (v == null || v === '') return '';
  return v.trim();
}

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    defaultCurrency: currencyCodeSchema.optional(),
    brandColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    email: optionalBlankString(z.string().trim().email()),
    phone: optionalBlankString(z.string().trim().max(32)),
    address: optionalBlankString(z.string().trim().max(500)),
    website: optionalBlankString(z.string().trim().max(200)),
    taxId: optionalBlankString(z.string().trim().max(64)),
    logoUrl: optionalBlankString(z.string().trim().url()),
  })
  .superRefine((data, ctx) => {
    // Only when contact fields are in the payload (settings/onboarding send all three).
    if (data.email === undefined && data.phone === undefined && data.address === undefined) {
      return;
    }
    const email = blankToEmpty(data.email);
    const phone = blankToEmpty(data.phone);
    const address = blankToEmpty(data.address);
    if (!email && !phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email or phone is required',
        path: ['email'],
      });
    }
    if (!address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Address is required',
        path: ['address'],
      });
    }
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const createOrgUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  membershipRole: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
});

export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;

export const updateOrgUserSchema = z.object({
  membershipRole: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'CASHIER']).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateOrgUserInput = z.infer<typeof updateOrgUserSchema>;

export const inviteOrgUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  membershipRole: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
});
export type InviteOrgUserInput = z.infer<typeof inviteOrgUserSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const returnInvoiceLinesSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .optional(),
});
export type ReturnInvoiceLinesInput = z.infer<typeof returnInvoiceLinesSchema>;

export function calcLineTotal(item: {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}) {
  const base = item.quantity * item.unitPrice - (item.discount ?? 0);
  const taxAmount = base * ((item.taxRate ?? 0) / 100);
  return {
    lineTotal: roundMoney(base + taxAmount),
    taxAmount: roundMoney(taxAmount),
  };
}

export function calcPurchaseOrderTotals(
  items: Array<{ quantity: number; unitCost: number }>,
) {
  const lines = items.map((item) => ({
    lineTotal: roundMoney(item.quantity * item.unitCost),
  }));
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  return { subtotal, lines };
}

export function calcInvoiceTotals(input: {
  items: Array<{ quantity: number; unitPrice: number; discount?: number; taxRate?: number }>;
  discount?: number;
  taxRate?: number;
}) {
  const lines = input.items.map((item) => {
    const base = item.quantity * item.unitPrice - (item.discount ?? 0);
    return { base, ...calcLineTotal(item) };
  });
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.base, 0));
  const discount = roundMoney(input.discount ?? 0);
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = roundMoney(taxable * ((input.taxRate ?? 0) / 100));
  const grandTotal = roundMoney(taxable + taxAmount);
  return { subtotal, discount, taxAmount, grandTotal, lines };
}

export function roundMoney(value: number, precision = 4) {
  const f = 10 ** precision;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Resolve paidAmount + paymentStatus for invoice create. */
export function resolveInvoicePayment(
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID',
  paidAmount: number | undefined,
  grandTotal: number,
): { paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID'; paidAmount: number } {
  if (paymentStatus === 'UNPAID') {
    return { paymentStatus: 'UNPAID', paidAmount: 0 };
  }
  if (paymentStatus === 'PAID') {
    return { paymentStatus: 'PAID', paidAmount: roundMoney(paidAmount ?? grandTotal) };
  }
  const paid = roundMoney(paidAmount ?? 0);
  if (paid <= 0 || paid >= grandTotal) {
    throw new Error('PARTIAL requires paidAmount between 0 and grandTotal');
  }
  return { paymentStatus: 'PARTIAL', paidAmount: paid };
}

/** After recording a payment, derive new paidAmount + status. */
export function applyInvoicePayment(
  currentPaid: number,
  amount: number,
  grandTotal: number,
): { paidAmount: number; paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' } {
  const paidAmount = roundMoney(Math.min(currentPaid + amount, grandTotal));
  if (paidAmount <= 0) return { paidAmount: 0, paymentStatus: 'UNPAID' };
  if (paidAmount >= grandTotal) return { paidAmount: roundMoney(grandTotal), paymentStatus: 'PAID' };
  return { paidAmount, paymentStatus: 'PARTIAL' };
}
