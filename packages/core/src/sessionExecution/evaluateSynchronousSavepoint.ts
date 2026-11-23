import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import type { ITx } from '../drizzle/types.ts';
import { withSavepoint } from '../drizzle/withSavepoint.ts';

import { isSoleAsyncSuspension } from './isSoleAsyncSuspension.ts';

/** Interpret suspension only after savepoint fencing, cancellation and rollback finish. */
export const evaluateSynchronousSavepoint = Effect.fn(
  'evaluateSynchronousSavepoint',
)(function* <A, E, R>(
  props: {
    tx: ITx;
    program: (props: { tx: ITx }) => Effect.Effect<A, E, R>;
  } & ([Extract<A, PromiseLike<unknown>>] extends [never] ? unknown : never),
) {
  const exit = yield* withSavepoint(props).pipe(Effect.exit);
  if (Exit.isSuccess(exit)) return exit.value;
  if (isSoleAsyncSuspension(exit.cause)) {
    return yield* makeZerospinError({
      code: 'program-must-be-synchronous',
      message: 'Programs and their capabilities must complete synchronously',
    });
  }
  return yield* Effect.failCause(exit.cause);
});
