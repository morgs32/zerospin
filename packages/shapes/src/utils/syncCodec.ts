import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import type * as SchemaAST from 'effect/SchemaAST';

import { runSynchronousExit } from '../runSynchronousExit.ts';

/** Decode without application services; reject codecs that suspend. */
export const decodeSync = <A>(
  codec: Schema.Codec<A, unknown>,
  input: unknown,
  options?: SchemaAST.ParseOptions,
) => runCodec(Schema.decodeUnknownEffect(codec)(input, options));

/** Encode without application services; reject codecs that suspend. */
export const encodeSync = <A, I>(
  codec: Schema.Codec<A, I>,
  value: A,
  options?: SchemaAST.ParseOptions,
) => runCodec(Schema.encodeEffect(codec)(value, options));

function runCodec<A>(
  program: Effect.Effect<A, Schema.SchemaError>,
): Effect.Effect<
  A,
  Schema.SchemaError | IZerospinError<'program-must-be-synchronous'>
> {
  return Effect.suspend<
    A,
    Schema.SchemaError | IZerospinError<'program-must-be-synchronous'>,
    never
  >(() => {
    const exit = runSynchronousExit(
      program,
      Effect.runSyncExitWith(Context.empty()),
    );
    if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);
    const reason = exit.cause.reasons[0];
    return exit.cause.reasons.length === 1 &&
      reason !== undefined &&
      Cause.isDieReason(reason) &&
      Cause.isAsyncFiberError(reason.defect)
      ? Effect.fail(makeZerospinError('program-must-be-synchronous'))
      : Effect.failCause(exit.cause);
  });
}
