import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

/** Classify only sole supported failures after makeTx has cancelled and rolled back. */
export function classifyAggregateAdmissionFailure<E>(
  cause: Cause.Cause<E>,
): Effect.Effect<never, E | IZerospinError<'aggregate-admission-failed'>> {
  const reason = cause.reasons[0];
  if (cause.reasons.length !== 1 || reason === undefined) {
    return Effect.failCause(cause);
  }
  if (Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)) {
    return Effect.fail(
      makeZerospinError({
        code: 'aggregate-admission-failed',
        message: 'Aggregate command validation must complete synchronously',
      }),
    );
  }
  if (Cause.isFailReason(reason)) {
    const error = reason.error;
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code === 'drizzle-transaction-failed'
    ) {
      return Effect.fail(
        makeZerospinError({
          code: 'aggregate-admission-failed',
          message: 'Failed to retain command',
          cause: prettyUnknownFailure(error),
        }),
      );
    }
  }
  return Effect.failCause(cause);
}
