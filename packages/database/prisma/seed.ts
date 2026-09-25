import {
  PrismaClient,
  MembershipRole,
  ContactType,
  ProductStatus,
  DocumentSequenceType,
  PlatformRole,
  SubscriptionStatus,
  BillingCycle,
} from '../generated/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const TRIAL_DAYS = 14;

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@inventory.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const testProduct = process.env.DODO_TEST_PRODUCT_ID?.trim() || null;

  // Global USD sweet spot: under Zoho, above commodity, Growth = Zoho Standard with POS bundled.
  const starter = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {
      name: 'Starter',
      description: 'One shop. Core POS, stock, and invoices.',
      priceMonthly: 15,
      priceYearly: 150,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      isActive: true,
      sortOrder: 1,
      maxUsers: 3,
      maxBranches: 1,
      features: [
        '1 branch',
        'Up to 3 users',
        'Products & barcode POS',
        'Invoices & contacts',
        'Inventory adjustments',
        'Purchase orders',
        'Basic reports',
        '14-day trial',
      ],
    },
    create: {
      id: 'plan-starter',
      name: 'Starter',
      slug: 'starter',
      description: 'One shop. Core POS, stock, and invoices.',
      priceMonthly: 15,
      priceYearly: 150,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      sortOrder: 1,
      maxUsers: 3,
      maxBranches: 1,
      features: [
        '1 branch',
        'Up to 3 users',
        'Products & barcode POS',
        'Invoices & contacts',
        'Inventory adjustments',
        'Purchase orders',
        'Basic reports',
        '14-day trial',
      ],
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'growth' },
    update: {
      name: 'Growth',
      description: 'Multi-branch wholesale. Best for most teams.',
      priceMonthly: 29,
      priceYearly: 290,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      isActive: true,
      sortOrder: 2,
      maxUsers: 10,
      maxBranches: 3,
      features: [
        'Up to 3 branches',
        'Up to 10 users',
        'Everything in Starter',
        'Multi-branch stock',
        'Role-based access',
        'Priority email support',
        'Offline payment requests',
        '14-day trial',
      ],
    },
    create: {
      id: 'plan-growth',
      name: 'Growth',
      slug: 'growth',
      description: 'Multi-branch wholesale. Best for most teams.',
      priceMonthly: 29,
      priceYearly: 290,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      sortOrder: 2,
      maxUsers: 10,
      maxBranches: 3,
      features: [
        'Up to 3 branches',
        'Up to 10 users',
        'Everything in Starter',
        'Multi-branch stock',
        'Role-based access',
        'Priority email support',
        'Offline payment requests',
        '14-day trial',
      ],
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'scale' },
    update: {
      name: 'Scale',
      description: 'Larger footprint. More seats and priority ops.',
      priceMonthly: 59,
      priceYearly: 590,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      isActive: true,
      sortOrder: 3,
      maxUsers: 25,
      maxBranches: 0,
      features: [
        'Unlimited branches',
        'Up to 25 users',
        'Everything in Growth',
        'Priority WhatsApp support',
        'Assisted onboarding',
        'Offline payment requests',
        '14-day trial',
      ],
    },
    create: {
      id: 'plan-scale',
      name: 'Scale',
      slug: 'scale',
      description: 'Larger footprint. More seats and priority ops.',
      priceMonthly: 59,
      priceYearly: 590,
      currency: 'USD',
      dodoProductIdMonthly: testProduct,
      dodoProductIdYearly: testProduct,
      sortOrder: 3,
      maxUsers: 25,
      maxBranches: 0,
      features: [
        'Unlimited branches',
        'Up to 25 users',
        'Everything in Growth',
        'Priority WhatsApp support',
        'Assisted onboarding',
        'Offline payment requests',
        '14-day trial',
      ],
    },
  });

  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-001' },
    update: { slug: 'demo-wholesale', status: 'ACTIVE' },
    create: {
      id: 'seed-org-001',
      name: 'Demo Wholesale',
      slug: 'demo-wholesale',
      status: 'ACTIVE',
      defaultCurrency: 'BDT',
      brandColor: '#18181b',
      settings: { lowStockDefault: 5 },
    },
  });

  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000);
  const existingSub = await prisma.organizationSubscription.findUnique({
    where: { organizationId: org.id },
  });
  if (!existingSub) {
    await prisma.organizationSubscription.create({
      data: {
        organizationId: org.id,
        planId: starter.id,
        status: SubscriptionStatus.TRIALING,
        billingCycle: BillingCycle.MONTHLY,
        trialEndsAt,
        currentPeriodStart: trialStartedAt,
        currentPeriodEnd: trialEndsAt,
      },
    });
  } else if (
    existingSub.status === SubscriptionStatus.TRIALING ||
    existingSub.status === SubscriptionStatus.PAST_DUE
  ) {
    // Refresh demo trial window; leave ACTIVE paid demo alone
    await prisma.organizationSubscription.update({
      where: { organizationId: org.id },
      data: {
        planId: starter.id,
        status: SubscriptionStatus.TRIALING,
        billingCycle: BillingCycle.MONTHLY,
        trialEndsAt,
        currentPeriodStart: trialStartedAt,
        currentPeriodEnd: trialEndsAt,
        graceEndsAt: null,
        channel: null,
      },
    });
  } else {
    await prisma.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { planId: starter.id },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-001' },
    update: {},
    create: {
      id: 'seed-branch-001',
      organizationId: org.id,
      name: 'Main Branch',
      code: 'MAIN',
      isDefault: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Admin' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Admin',
      // Authz uses MembershipRole; permissions array is unused placeholder.
      permissions: [],
    },
  });

  await prisma.role.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Cashier' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Cashier',
      permissions: [],
    },
  });

  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? email).toLowerCase();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name: 'Admin User',
      isActive: true,
      platformRole: email.toLowerCase() === platformEmail ? PlatformRole.OWNER : PlatformRole.NONE,
    },
    create: {
      email,
      passwordHash,
      name: 'Admin User',
      platformRole: email.toLowerCase() === platformEmail ? PlatformRole.OWNER : PlatformRole.NONE,
    },
  });

  if (platformEmail !== email.toLowerCase()) {
    await prisma.user.updateMany({
      where: { email: platformEmail },
      data: { platformRole: PlatformRole.OWNER },
    });
  }

  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: user.id, organizationId: org.id },
    },
    update: { role: MembershipRole.OWNER, roleId: adminRole.id },
    create: {
      userId: user.id,
      organizationId: org.id,
      role: MembershipRole.OWNER,
      roleId: adminRole.id,
    },
  });

  await prisma.documentSequence.upsert({
    where: {
      organizationId_type: { organizationId: org.id, type: DocumentSequenceType.INVOICE },
    },
    update: {},
    create: {
      organizationId: org.id,
      type: DocumentSequenceType.INVOICE,
      prefix: 'INV',
      nextValue: 1,
    },
  });

  await prisma.documentSequence.upsert({
    where: {
      organizationId_type: { organizationId: org.id, type: DocumentSequenceType.PURCHASE_ORDER },
    },
    update: {},
    create: {
      organizationId: org.id,
      type: DocumentSequenceType.PURCHASE_ORDER,
      prefix: 'PO',
      nextValue: 1,
    },
  });

  const products = [
    {
      sku: 'RICE-25KG',
      name: 'Premium Rice 25kg',
      barcode: '8901001001001',
      costPrice: 1800,
      sellingPrice: 2100,
      stock: 120,
      unit: 'bag',
    },
    {
      sku: 'OIL-5L',
      name: 'Cooking Oil 5L',
      barcode: '8901001001002',
      costPrice: 650,
      sellingPrice: 780,
      stock: 80,
      unit: 'bottle',
    },
    {
      sku: 'SOAP-001',
      name: 'Bar Soap Pack',
      barcode: '8901001001003',
      costPrice: 45,
      sellingPrice: 60,
      stock: 4,
      unit: 'pcs',
      lowStockAt: 10,
    },
    {
      sku: 'SUGAR-1KG',
      name: 'Sugar 1kg',
      barcode: '8901001001004',
      costPrice: 90,
      sellingPrice: 110,
      stock: 200,
      unit: 'pcs',
    },
    {
      sku: 'TEA-500G',
      name: 'Black Tea 500g',
      barcode: '8901001001005',
      costPrice: 220,
      sellingPrice: 280,
      stock: 45,
      unit: 'pcs',
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
      update: {},
      create: {
        organizationId: org.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        stock: p.stock,
        lowStockAt: p.lowStockAt ?? 5,
        unit: p.unit,
        status: ProductStatus.ACTIVE,
        createdById: user.id,
      },
    });
  }

  await prisma.contact.upsert({
    where: { id: 'seed-contact-001' },
    update: {},
    create: {
      id: 'seed-contact-001',
      organizationId: org.id,
      name: 'Walk-in Customer',
      type: ContactType.CUSTOMER,
      phone: '01700000000',
      createdById: user.id,
    },
  });

  await prisma.contact.upsert({
    where: { id: 'seed-contact-002' },
    update: {},
    create: {
      id: 'seed-contact-002',
      organizationId: org.id,
      name: 'City Distributors',
      type: ContactType.SUPPLIER,
      phone: '01800000000',
      address: 'Dhaka',
      createdById: user.id,
    },
  });

  console.log('Seed complete');
  console.log(`  Org: ${org.name} (${org.id})`);
  console.log(`  Branch: ${branch.name}`);
  console.log(`  Admin: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
