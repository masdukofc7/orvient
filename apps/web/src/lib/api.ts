import type { SessionUser } from '@inventory/shared';
import { getAccessToken, setAccessToken, setSessionFlag, getLastOrganizationId, setLastOrganizationId } from './auth-token';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let refreshPromise: Promise<string | null> | null = null;
type SessionHandler = (token: string, user: SessionUser) => void;
let sessionHandler: SessionHandler | null = null;

export function onSessionRestore(handler: SessionHandler | null) {
  sessionHandler = handler;
}

function clearClientSession() {
  setAccessToken(null);
  setSessionFlag(false);
  setLastOrganizationId(null);
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

type ErrorPayload = {
  message?: string | string[];
  errors?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

function extractErrorMessage(data: unknown, fallback: string): string {
  const payload = data as ErrorPayload | null;
  const base = Array.isArray(payload?.message)
    ? payload.message.join(', ')
    : (payload?.message ?? fallback);

  const fieldErrors = payload?.errors?.fieldErrors;
  if (!fieldErrors) return base;

  const hints = Object.entries(fieldErrors)
    .flatMap(([field, msgs]) => (msgs?.length ? [`${field}: ${msgs[0]}`] : []))
    .slice(0, 3);

  if (!hints.length) return base;
  return `${base} — ${hints.join('; ')}`;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token !== undefined ? options.token : getAccessToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0, null);
  }

  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api(path, { ...options, token: refreshed });
    }
    clearClientSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired', 401, null);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, 'Request failed'), res.status, data);
  }
  return data as T;
}

/** Restore access token from httpOnly refresh cookie. */
export async function restoreSession(): Promise<boolean> {
  const token = await tryRefresh();
  return Boolean(token);
}

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const orgId = getLastOrganizationId();
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(orgId ? { organizationId: orgId } : {}),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string; user: SessionUser };
      setAccessToken(data.accessToken);
      setSessionFlag(true);
      setLastOrganizationId(data.user.organizationId);
      sessionHandler?.(data.accessToken, data.user);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}
