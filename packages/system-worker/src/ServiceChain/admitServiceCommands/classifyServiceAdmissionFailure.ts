import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

/** Classification runs after transaction rollback and cancellation, preserving every composite Cause. */
export function classifyServiceAdmissionFailure<E>(
  cause: Cause.Cause<E>,
): Effect.Effect<
  never,
  E | IZerospinError<'service-admission-failed' | 'program-must-be-synchronous'>
> {
  const reason = cause.reasons[0];
  if (
    cause.reasons.length === 1 &&
    reason !== undefined &&
    Cause.isDieReason(reason) &&
    Cause.isAsyncFiberError(reason.defect)
  ) {
    return Effect.fail(makeZerospinError('program-must-be-synchronous'));
  }
  if (
    cause.reasons.length === 1 &&
    reason !== undefined &&
    Cause.isFailReason(reason) &&
    typeof reason.error === 'object' &&
    reason.error !== null &&
    'code' in reason.error &&
    reason.error.code === 'drizzle-transaction-failed'
  ) {
    return Effect.fail(
      makeZerospinError({
        code: 'service-admission-failed',
        cause: Cause.pretty(cause),
      }),
    );
  }
  return Effect.failCause(cause);
}
