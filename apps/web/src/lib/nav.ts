import { isStaffRole } from '@inventory/shared';
import {
  LayoutDashboard,
  Package,
  Users,
  Warehouse,
  FileText,
  BarChart3,
  Settings,
  ShoppingCart,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shorter label for compact nav (mobile bar) */
  shortLabel?: string;
  /** Show in mobile bottom bar */
  primary?: boolean;
  /** Hide from cashiers when true — maps to inventory.manage / staff bundle */
  staffOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { href: '/pos', label: 'POS', icon: ShoppingCart, primary: true },
  { href: '/invoices', label: 'Invoices', icon: FileText, primary: true },
  { href: '/products', label: 'Products', icon: Package, primary: true },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/purchase-orders', label: 'Purchasing', icon: ClipboardList, staffOnly: true },
  { href: '/inventory', label: 'Stock', icon: Warehouse, staffOnly: true },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings, staffOnly: true },
];

export function navItemsForRole(role?: string | null) {
  // Session still loading → show full nav; filter once role is known
  if (role == null || role === '') return NAV_ITEMS;
  return NAV_ITEMS.filter((item) => !item.staffOnly || isStaffRole(role));
}

export function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
