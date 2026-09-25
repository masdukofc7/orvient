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

export function setSessionFlag(on: boolean) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const sameSite =
    process.env.NODE_ENV === 'production' || window.location.protocol === 'https:'
      ? 'Strict'
      : 'Lax';
  if (on) {
    document.cookie = `${SESSION_COOKIE}=1; path=/; SameSite=${sameSite}; Max-Age=${7 * 24 * 60 * 60}${secure}`;
    return;
  }
  document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=${sameSite}${secure}`;
}
