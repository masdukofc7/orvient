/** In-memory access token — not written to localStorage (XSS surface). */
let accessToken: string | null = null;
let lastOrganizationId: string | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getLastOrganizationId() {
  return lastOrganizationId;
}

export function setLastOrganizationId(organizationId: string | null) {
  lastOrganizationId = organizationId;
}

const SESSION_COOKIE = 'inv_session';
/** Routing hints only — not security. API guards are authoritative. */
const PLATFORM_COOKIE = 'inv_platform';
const STAFF_COOKIE = 'inv_staff';
const OWNER_ADMIN_COOKIE = 'inv_owner_admin';

function setFlagCookie(name: string, on: boolean) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const sameSite =
    process.env.NODE_ENV === 'production' || window.location.protocol === 'https:'
      ? 'Strict'
      : 'Lax';
  if (on) {
    document.cookie = `${name}=1; path=/; SameSite=${sameSite}; Max-Age=${7 * 24 * 60 * 60}${secure}`;
    return;
  }
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=${sameSite}${secure}`;
}

export function setSessionFlag(on: boolean) {
  setFlagCookie(SESSION_COOKIE, on);
}

export function setAuthHintFlags(hints: {
  platform: boolean;
  staff: boolean;
  ownerAdmin: boolean;
} | null) {
  setFlagCookie(PLATFORM_COOKIE, Boolean(hints?.platform));
  setFlagCookie(STAFF_COOKIE, Boolean(hints?.staff));
  setFlagCookie(OWNER_ADMIN_COOKIE, Boolean(hints?.ownerAdmin));
}
