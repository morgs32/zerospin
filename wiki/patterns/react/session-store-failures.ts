import type { ISessionLifecycleState } from '@zerospin/browser';
import type { StoreApi } from 'zustand/vanilla';

/**
 * Observe failures through the existing session store. Acquire this subscription
 * in the React/host lifetime before the loading gate, keep it mounted through
 * initialization/recovery, and release it at cleanup. A changed nonnull failure
 * is a fresh occurrence, even for repeated messages. Command refusals and recovery
 * notices about local work that may be lost or unconfirmed are nonterminal;
 * preserving repair stays quiet. Terminal reporting atomically publishes failed
 * status, its first pinned error and null initialized capability after fencing
 * execution. Lazy runtime acquisition stays idle. Ordinary disposal permits reinitialization after
 * cleanup and preserves nonterminal failure; failed instances need a new owner.
 *
 * Managed React hooks accept { onFailure } as their third argument so observers
 * are installed before initialization and remain active through recovery. SessionReady
 * handles render-time query errors for its own session. Ordinary rendering
 * exceptions propagate to an enclosing UI error boundary. Its required renderError receives the normalized
 * IZerospinError and retry callback. Retry owns disposal and replaces the generation instead of reviving
 * the failed facade or clearing its first pinned error.
 * Errors outside session execution need explicit session-origin reporting.
 *
 * @bad Render a refusal/recovery toast from renderError instead of subscribing to changes.
 * @bad Mount the notification observer only after the session becomes ready.
 * @bad Mirror lifecycle/failure state or create another notification channel.
 */
export const unsubscribe = session.store.subscribe((state, previous) => {
  if (
    state.status !== 'failed' &&
    state.failure !== null &&
    state.failure !== previous.failure
  ) {
    notificationUi.error(state.failure.message);
  }
});

declare const session: { store: StoreApi<ISessionLifecycleState> };
declare const notificationUi: { error(message: string): void };
