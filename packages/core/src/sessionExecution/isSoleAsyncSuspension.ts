import * as Cause from 'effect/Cause';

/** Only a sole synchronous-run suspension is an authored synchronous-policy refusal. */
export function isSoleAsyncSuspension(cause: Cause.Cause<unknown>): boolean {
  const reason = cause.reasons[0];
  return (
    cause.reasons.length === 1 &&
    reason !== undefined &&
    Cause.isDieReason(reason) &&
    Cause.isAsyncFiberError(reason.defect)
  );
}
