import * as Cause from 'effect/Cause';
import * as Exit from 'effect/Exit';

import type { ISessionFailureReporter } from '../sessionFailure/types.ts';

export function reportSessionDefects<A, E>(
  exit: Exit.Exit<A, E>,
  reportFailure: ISessionFailureReporter,
): void {
  if (Exit.isSuccess(exit) || !Cause.hasDies(exit.cause)) return;
  // Reporting must never replace the execution's original failure.
  try {
    reportFailure({ origin: 'session', error: exit.cause });
  } catch {}
}
