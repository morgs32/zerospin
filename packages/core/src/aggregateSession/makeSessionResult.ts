import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  PublicFailureSchema,
  recognizeZerospinError,
  type IRecognizedFailure,
  type IResult,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { encodeFailure, resolveFailure } from '../contracts/failureCodec.ts';
import type { IContractRelease, IInferFailure } from '../contracts/types.ts';
import { isNonFailureCause } from '../execution/runAuthoredCallback.ts';

const recognizeSessionFrameworkFailure = (failure: unknown) =>
  encodeError(failure).pipe(
    Effect.map(encoded => recognizeZerospinError(Schema.Never, encoded)),
  );

export const makeSessionResult =
  <CONTRACT extends IContractRelease>(contract: CONTRACT | undefined) =>
  <SUCCESS, FAILURE, REQUIREMENTS>(
    program: Effect.Effect<SUCCESS, FAILURE, REQUIREMENTS>,
  ): Effect.Effect<
    IResult<SUCCESS, IRecognizedFailure<IInferFailure<CONTRACT>>>,
    never,
    REQUIREMENTS
  > => {
    return program.pipe(
      Effect.matchCauseEffect({
        onSuccess: success =>
          Effect.succeed<{ _tag: 'Success'; success: SUCCESS }>({
            _tag: 'Success',
            success,
          }),
        onFailure: (
          cause,
        ): Effect.Effect<
          IResult<SUCCESS, IRecognizedFailure<IInferFailure<CONTRACT>>>,
          never
        > => {
          if (isNonFailureCause(cause)) {
            return Effect.failCause(cause);
          }
          if (cause.reasons.length !== 1) return Effect.die(cause);
          const reason = cause.reasons[0];
          if (reason === undefined || !Cause.isFailReason(reason)) {
            return Effect.die(cause);
          }
          const failure = reason.error;
          return (
            contract === undefined
              ? recognizeSessionFrameworkFailure(failure)
              : (Schema.is(PublicFailureSchema)(failure) &&
                !isZerospinError(failure)
                  ? Effect.succeed(failure)
                  : encodeFailure(contract, failure)
                ).pipe(
                  Effect.flatMap(encoded => resolveFailure(contract, encoded)),
                  Effect.catchCause(cause => {
                    if (isNonFailureCause(cause)) {
                      return Effect.failCause(cause);
                    }
                    if (cause.reasons.length !== 1) return Effect.die(cause);
                    const reason = cause.reasons[0];
                    return reason !== undefined && Cause.isFailReason(reason)
                      ? recognizeSessionFrameworkFailure(reason.error)
                      : Effect.die(cause);
                  }),
                )
          ).pipe(
            Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
          );
        },
      }),
    );
  };

export const aggregateSessionUnavailable = () =>
  Effect.runSync(
    recognizeSessionFrameworkFailure(
      makeZerospinError('aggregate-session-not-ready'),
    ),
  );
