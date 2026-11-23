import {
  ensureZerospinError,
  isZerospinError,
  makeZerospinError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import type { StoreApi } from 'zustand/vanilla';

import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from './types.ts';

/** Store a fresh occurrence while preserving structured errors and original Cause diagnostics. */
export function makeSessionFailureReporter<
  STATE extends ISessionLifecycleState,
>(props: {
  store: StoreApi<STATE>;
  onTerminalFailure(): void;
}): ISessionFailureReporter {
  const { store, onTerminalFailure } = props;
  let terminal = false;
  return report => {
    if (terminal || store.getState().status === 'failed') return;
    let error = report.error;
    if (Cause.isCause(error) && error.reasons.length === 1) {
      const reason = error.reasons[0];
      const contained =
        reason !== undefined && Cause.isFailReason(reason)
          ? reason.error
          : reason !== undefined && Cause.isDieReason(reason)
            ? reason.defect
            : undefined;
      if (isZerospinError(contained)) error = contained;
    }
    const normalized = ensureZerospinError({ code: 'session-failed', error });
    const occurrence = makeZerospinError({
      code: normalized.code,
      message: normalized.message,
      status: normalized.status,
      extra: normalized.extra,
      cause: normalized.cause,
    });
    if (normalized.stack !== undefined) occurrence.stack = normalized.stack;
    if (report.origin !== 'session') {
      store.setState(state => ({ ...state, failure: occurrence }));
      return;
    }
    terminal = true;
    // Revoke execution before publication can synchronously invoke application observers.
    try {
      onTerminalFailure();
    } finally {
      store.setState(state => ({
        ...state,
        status: 'failed',
        failure: occurrence,
        ...('initialized' in state ? { initialized: null } : {}),
      }));
    }
  };
}
