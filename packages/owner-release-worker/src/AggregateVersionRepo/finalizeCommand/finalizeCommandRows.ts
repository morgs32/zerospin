import {
  ensureZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import type { IEvaluatedAggregateCommand } from '@zerospin/system-worker/AggregateVersionChain/evaluatedAggregateCommand';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

import { finalizeCommand } from './finalizeCommand.js';

/** Finalize originals. An execution defect refuses delivery and leaves the original pending. */
export const finalizeCommandRows = Effect.fn(
  'AggregateVersionRepo.finalizeCommandRows',
)((
  props: Omit<Parameters<typeof finalizeCommand>[0], 'command'> & {
    rows: readonly Parameters<typeof finalizeCommand>[0]['command'][];
  },
): Effect.Effect<
  IEvaluatedAggregateCommand[],
  IAnyError,
  Effect.Services<ReturnType<typeof finalizeCommand>>
> => {
  const { rows, db, key, execution, replayThrough } = props;
  return Effect.forEach(rows, command =>
    finalizeCommand({
      command,
      db,
      key,
      execution,
      replayThrough,
    }).pipe(
      Effect.catchCause(cause =>
        Effect.failCause(
          Cause.map(cause, error =>
            ensureZerospinError({
              code: 'aggregate-original-execution-failed',
              error,
            }),
          ),
        ),
      ),
      Effect.catchDefect(defect =>
        Effect.fail(
          makeZerospinError({
            code: 'aggregate-original-execution-defect',
            cause: prettyUnknownFailure(defect),
          }),
        ),
      ),
    ),
  );
});
