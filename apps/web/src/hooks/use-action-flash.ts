'use client';

import { useEffect, useState } from 'react';

/** idle → loading → success (auto-clears) for button feedback. */
export function useActionFlash(successMs = 1500) {
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

  useEffect(() => {
    if (state !== 'success') return;
    const t = setTimeout(() => setState('idle'), successMs);
    return () => clearTimeout(t);
  }, [state, successMs]);

  return {
    loading: state === 'loading',
    success: state === 'success',
    flashSuccess: () => setState('success'),
    run: async (fn: () => Promise<void>) => {
      setState('loading');
      try {
        await fn();
        setState('success');
      } catch (e) {
        setState('idle');
        throw e;
      }
    },
  };
}
