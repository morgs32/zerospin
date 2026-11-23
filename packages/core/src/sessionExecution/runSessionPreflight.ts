import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import type { ISessionFailureReporter } from '../sessionFailure/types.ts';

import { reportSessionDefects } from './reportSessionDefects.ts';

export function runSessionPreflight<A, E>(props: {
  program: Effect.Effect<A, E>;
  reportFailure: ISessionFailureReporter;
}): A {
  const { program, reportFailure } = props;
  const exit = runSynchronousExit(program, Effect.runSyncExit);
  reportSessionDefects(exit, reportFailure);
  return Effect.runSync(exit);
}
