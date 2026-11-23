'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { makeZerospinError } from '@zerospin/error';

/**
 * Returns admitted aggregate claims or published service claims. Throws while
 * the store is unpublished — mount only under the matching SessionReady gate.
 */
export function useClaims<CLAIMS>(session: {
  store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { initialized: { readonly claims: CLAIMS } | null };
  };
}): CLAIMS {
  const getSnapshot = useMemo(() => {
    let previous: { readonly claims: CLAIMS } | null = null;
    let claims: CLAIMS | null = null;
    return () => {
      const state = session.store.getState();
      if (state.initialized !== previous) {
        previous = state.initialized;
        // Keep one claims snapshot until the published capability changes.
        claims = state.initialized?.claims ?? null;
      }
      return claims;
    };
  }, [session]);
  const claims = useSyncExternalStore(
    session.store.subscribe,
    getSnapshot,
    getSnapshot,
  );
  if (claims === null) {
    throw makeZerospinError({
      code: 'session-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  return claims;
}
