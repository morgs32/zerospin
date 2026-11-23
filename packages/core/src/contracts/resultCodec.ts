import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
} from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IContractRelease, IInferContractResult } from './types.ts';

const isolateResultCodec = <A, E>(program: Effect.Effect<A, E>) =>
  program.pipe(Effect.updateContext<never, never>(() => Context.empty()));
/** Validate decoded domain output before the owning workflow encodes it once. */
export const validateContractResult = Effect.fn('validateContractResult')(
  function* (contract: Pick<IContractRelease, 'result'>, value: unknown) {
    if (contract.result === undefined) {
      if (value !== undefined) {
        return yield* makeZerospinError({
          code: 'contract-program-result-invalid',
          message: 'A contract without a result codec must return void',
        });
      }
      return;
    }
    return yield* isolateResultCodec(
      Schema.decodeUnknownEffect(Schema.toType(contract.result))(value, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-program-result-invalid',
          prefix: 'Invalid contract result',
        }),
      ),
    );
  },
);
export const encodeContractResult = Effect.fn('encodeContractResult')(
  function* (contract: Pick<IContractRelease, 'result'>, value: unknown) {
    if (contract.result === undefined) {
      if (value !== undefined) {
        return yield* makeZerospinError({
          code: 'contract-program-result-invalid',
          message: 'A contract without a result codec must return void',
        });
      }
      return null;
    }
    const encoded = yield* isolateResultCodec(
      Schema.encodeUnknownEffect(contract.result)(value, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-result-encode-failed',
          prefix: 'Cannot encode contract result',
        }),
      ),
    );
    return yield* Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
      mapParseError({
        code: 'contract-result-encoding-invalid',
        prefix: 'Contract result must encode as JSON',
      }),
    );
  },
);
export function resolveContractResult<C extends IContractRelease>(
  contract: C,
  saved: { commandName: string; contractVersion: number; result: unknown },
): Effect.Effect<
  IInferContractResult<C>,
  IZerospinError<
    'contract-result-identity-mismatch' | 'contract-result-decode-failed'
  >
>;
export function resolveContractResult(
  contract: IContractRelease,
  saved: { commandName: string; contractVersion: number; result: unknown },
) {
  return Effect.gen(function* () {
    if (
      saved.commandName !== contract.commandName ||
      saved.contractVersion !== contract.version
    ) {
      return yield* Effect.fail(
        makeZerospinError('contract-result-identity-mismatch'),
      );
    }
    if (contract.result === undefined) {
      yield* Schema.decodeUnknownEffect(Schema.Null)(saved.result).pipe(
        mapParseError({
          code: 'contract-result-decode-failed',
          prefix: 'Expected null for a contract without a result',
        }),
      );
      return;
    }
    return yield* isolateResultCodec(
      Schema.decodeUnknownEffect(contract.result)(saved.result, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-result-decode-failed',
          prefix: 'Invalid retained contract result',
        }),
      ),
    );
  });
}
