import {
  encodeError,
  type IErrorJson,
  type IZerospinErrorJson,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Result from 'effect/Result';

import type { IRpcEnvelope, ITelemetryBatch } from './types.ts';

/** Encode a captured Exit after its owning boundary has reported diagnostics. */
export function encodeRpcExit<A, E extends IZerospinErrorJson>(
  exit: Exit.Exit<A, E>,
  telemetry: ITelemetryBatch,
): Effect.Effect<
  IRpcEnvelope<
    A,
    [E] extends [never]
      ? never
      : IZerospinErrorJson<E['code'] | 'error-serialization-failed'>
  >
>;
export function encodeRpcExit<A, E>(
  exit: Exit.Exit<A, E>,
  telemetry: ITelemetryBatch,
): Effect.Effect<IRpcEnvelope<A, IErrorJson<E>>>;
export function encodeRpcExit<A, E>(
  exit: Exit.Exit<A, E>,
  telemetry: ITelemetryBatch,
): Effect.Effect<IRpcEnvelope<A, IErrorJson<E>>> {
  return Effect.gen(function* () {
    if (Exit.isSuccess(exit)) {
      return {
        result: { _tag: 'Success' as const, success: exit.value },
        telemetry,
      };
    }
    const reason = exit.cause.reasons[0];
    if (
      exit.cause.reasons.length !== 1 ||
      reason === undefined ||
      !Cause.isFailReason(reason)
    ) {
      const error = Cause.findError(exit.cause);
      if (Result.isFailure(error)) {
        return yield* Effect.failCause(error.failure);
      }
      // One encoded failure cannot represent a composite Cause. Retain the
      // complete Cause as a defect instead of discarding its other reasons.
      return yield* Effect.die(exit.cause);
    }
    const failure = yield* encodeError(reason.error);
    return {
      result: { _tag: 'Failure' as const, failure },
      telemetry,
    };
  });
}
