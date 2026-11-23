import {
  encodeError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import type {
  EncodedContinuationPayloadSchema,
  FailedContinuationPayloadSchema,
} from './ContinuationPayloadSchema.ts';
import { encodePayload } from './encodePayload.ts';
import type { IContractRelease } from './types.ts';

/** Record mapper and encoding failures for the selected ordinary contract. */
export const encodeContinuationPayload = Effect.fn('encodeContinuationPayload')(
  function* <SERVICES>(props: {
    contract: IContractRelease;
    build: () => Effect.Effect<unknown, unknown, SERVICES>;
    mapperFailureCode: string;
  }): Effect.fn.Return<
    | typeof EncodedContinuationPayloadSchema.Type
    | typeof FailedContinuationPayloadSchema.Type,
    IAnyError,
    SERVICES
  > {
    const { contract, build, mapperFailureCode } = props;
    const mapperFailure = makeZerospinError({
      code: mapperFailureCode,
      message: `Failed to build payload for continuation "${contract.commandName}" at version "${contract.version}"`,
    });
    const exit = yield* Effect.exit(
      Effect.suspend(build).pipe(
        Effect.mapError(() => mapperFailure),
        Effect.flatMap(payload =>
          encodePayload(contract, { version: contract.version, payload }),
        ),
      ),
    );
    const selected = {
      commandName: contract.commandName,
      contractVersion: contract.version,
    };
    if (Exit.isSuccess(exit)) {
      return { ...selected, payload: exit.value, failure: null };
    }
    const { cause } = exit;
    if (Cause.hasInterrupts(cause)) return yield* Effect.failCause(cause);
    const reason = cause.reasons[0];
    const error =
      cause.reasons.length === 1 &&
      reason !== undefined &&
      Cause.isFailReason(reason)
        ? reason.error
        : mapperFailure;
    return { ...selected, payload: null, failure: yield* encodeError(error) };
  },
);
