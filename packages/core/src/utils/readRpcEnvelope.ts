import {
  makeZerospinError,
  type IResult,
  type IZerospinError,
} from '@zerospin/error';
import {
  InternalRpcEnvelopeSchema,
  TelemetryCollector,
  type ITelemetryBatch,
} from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

/** Consume the domain result only after merging the remote diagnostic batch. */
export const readRpcEnvelope = Effect.fn('readRpcEnvelope')(function* <
  A,
  E = never,
>(
  envelope: Readonly<{ result: IResult<A, E>; telemetry: ITelemetryBatch }>,
): Effect.fn.Return<A, E | IZerospinError<'rpc-envelope-invalid'>> {
  if (!Schema.is(InternalRpcEnvelopeSchema)(envelope)) {
    return yield* Effect.fail(makeZerospinError('rpc-envelope-invalid'));
  }
  const collector = yield* Effect.serviceOption(TelemetryCollector);
  if (Option.isSome(collector)) collector.value.merge(envelope.telemetry);
  return yield* envelope.result._tag === 'Failure'
    ? Effect.fail(envelope.result.failure)
    : Effect.succeed(envelope.result.success);
});
