import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import type { IEvaluatedServiceCommand } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import * as Effect from 'effect/Effect';

import { executeCommand } from './executeCommand.js';

/** Execute one original. An execution defect refuses delivery and leaves the original pending. */
export const executeCommandRows = Effect.fn(
  'ServiceVersionRepo.executeCommandRows',
)((
  props: Omit<Parameters<typeof executeCommand>[0], 'command'> & {
    rows: readonly Parameters<typeof executeCommand>[0]['command'][];
  },
): Effect.Effect<
  IEvaluatedServiceCommand[],
  | Effect.Error<ReturnType<typeof executeCommand>>
  | IZerospinError<
      'service-original-delivery-invalid' | 'service-original-execution-defect'
    >,
  Effect.Services<ReturnType<typeof executeCommand>>
> => {
  const { rows, ...execution } = props;
  return Effect.gen(function* () {
    const command = rows[0];
    if (rows.length !== 1 || command === undefined) {
      return yield* makeZerospinError('service-original-delivery-invalid');
    }
    const result = yield* executeCommand({
      command,
      ...execution,
    }).pipe(
      Effect.catchDefect(defect =>
        Effect.fail(
          makeZerospinError({
            code: 'service-original-execution-defect',
            cause: prettyUnknownFailure(defect),
          }),
        ),
      ),
    );
    return [result];
  });
});
