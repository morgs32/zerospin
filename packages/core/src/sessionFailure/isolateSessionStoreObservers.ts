import type { StoreApi } from 'zustand/vanilla';

/** Keep Zustand publication intact when an application observer throws. */
export function isolateSessionStoreObservers<STATE>(
  store: StoreApi<STATE>,
): void {
  const subscribe = store.subscribe;
  store.subscribe = listener =>
    subscribe((state, previous) => {
      try {
        listener(state, previous);
      } catch (error) {
        console.error('Session store observer threw', error);
      }
    });
}
