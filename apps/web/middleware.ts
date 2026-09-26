import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/accept-invite';
  const isPublicPage = isAuthPage || pathname === '/pricing' || pathname.startsWith('/receipt/');
  const isPlatformPage = pathname === '/platform' || pathname.startsWith('/platform/');
  const isOwnerAdminPage =
    pathname === '/settings/billing' || pathname.startsWith('/settings/billing/');
  const isStaffPage =
    pathname === '/inventory' ||
    pathname.startsWith('/inventory/') ||
    pathname === '/purchase-orders' ||
    pathname.startsWith('/purchase-orders/') ||
    pathname === '/settings' ||
    (pathname.startsWith('/settings/') && !isOwnerAdminPage);

  const hasSession =
    req.cookies.get('inv_session')?.value === '1' ||
    Boolean(req.cookies.get('accessToken')?.value);
  // Routing hints only — real authz is API guards + JWT.
  const isPlatformAdmin = req.cookies.get('inv_platform')?.value === '1';
  const isStaff = req.cookies.get('inv_staff')?.value === '1';
  const isOwnerAdmin = req.cookies.get('inv_owner_admin')?.value === '1';

  if (!isPublicPage && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (isPlatformPage && hasSession && !isPlatformAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isOwnerAdminPage && hasSession && !isOwnerAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isStaffPage && hasSession && !isStaff) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)'],
};
