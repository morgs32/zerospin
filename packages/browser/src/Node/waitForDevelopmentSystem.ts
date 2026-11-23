import {
  isZerospinError,
  makeZerospinError,
  type IZerospinError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { awaitConnectionStep } from './awaitConnectionStep.ts';
import { isBrowserOffline } from './isBrowserOffline.ts';
import { isLocalNodeEndpoint } from './selectDevelopmentStorage.ts';

/** The CLI's authenticated readiness response is retryable. Only a successful snapshot proves history. */
export function isDevelopmentSystemStarting(
  endpoint: string,
  error: unknown,
): error is IZerospinError<'node-development-system-starting'> {
  return (
    isZerospinError(error) &&
    !('scope' in error) &&
    error.code === 'node-development-system-starting' &&
    error.status === 503 &&
    isLocalNodeEndpoint(endpoint)
  );
}

export async function waitForDevelopmentSystem<A>(
  endpoint: string,
  signal: AbortSignal,
  operation: () => Promise<A>,
  options: { timeoutMs?: number; verifiedHistoryId?: string | undefined } = {},
): Promise<A> {
  // A single slow first request retains the network layer's usual timeout and offline behavior.
  // Once the server acknowledges startup, keep its readiness failure if the cold attachment expires.
  const { timeoutMs, verifiedHistoryId } = options;
  const deadline =
    timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs);
  const retrySignal =
    deadline === undefined ? signal : AbortSignal.any([signal, deadline]);
  let active = signal;
  let starting: IZerospinError | undefined;
  for (;;) {
    if (signal.aborted) throw makeZerospinError('node-tab-detached');
    if (starting !== undefined && active.aborted) {
      return Promise.reject(starting);
    }
    try {
      return await awaitConnectionStep(operation(), active);
    } catch (error) {
      if (signal.aborted) throw makeZerospinError('node-tab-detached');
      if (starting !== undefined && active.aborted) {
        return Promise.reject(starting);
      }
      // Only an already-verified local Node waits through a CLI restart with no listener.
      // The next authenticated snapshot must still prove the history before any file is selected.
      const unavailable =
        verifiedHistoryId !== undefined &&
        isLocalNodeEndpoint(endpoint) &&
        isZerospinError(error) &&
        (error.code === 'node-backend-unreachable' ||
          error.code === 'node-backend-timeout');
      if (!unavailable && !isDevelopmentSystemStarting(endpoint, error)) {
        throw error;
      }
      starting = error;
      active = retrySignal;
      // Retiring an owner cancels its backoff and prevents the next authenticated request.
      do {
        await Effect.runPromise(Effect.sleep(unavailable ? 3000 : 500), {
          signal: active,
        }).catch(cause => {
          if (!active.aborted) throw cause;
        });
      } while (unavailable && !active.aborted && isBrowserOffline());
    }
  }
}
