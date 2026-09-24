/** Pricing → register intent (session) + first-run setup flag (local). */

export type SignupIntent = {
  planId?: string;
  cycle?: 'MONTHLY' | 'YEARLY';
};

const INTENT_KEY = 'orvient:signupIntent';

function setupKey(orgId: string) {
  return `orvient:setupDone:${orgId}`;
}

export function setSignupIntent(intent: SignupIntent) {
  try {
    if (!intent.planId && !intent.cycle) {
      sessionStorage.removeItem(INTENT_KEY);
      return;
    }
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
}

export function getSignupIntent(): SignupIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupIntent;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSignupIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

export function billingHrefFromIntent(intent?: SignupIntent | null) {
  const i = intent ?? getSignupIntent();
  const params = new URLSearchParams();
  if (i?.planId) params.set('plan', i.planId);
  if (i?.cycle) params.set('cycle', i.cycle);
  const q = params.toString();
  return q ? `/settings/billing?${q}` : '/settings/billing';
}

export function markSetupDone(orgId: string) {
  try {
    localStorage.setItem(setupKey(orgId), '1');
  } catch {
    /* ignore */
  }
}

export function isSetupDone(orgId: string) {
  try {
    return localStorage.getItem(setupKey(orgId)) === '1';
  } catch {
    return false;
  }
}
