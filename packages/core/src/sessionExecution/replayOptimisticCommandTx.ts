import { isZerospinError, makeZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { encodeFailure } from '../contracts/failureCodec.ts';
import { encodeContractResult } from '../contracts/resultCodec.ts';
import type { IContractOutput, IContractRelease } from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';

import { applyOptimisticOperationsTx } from './applyOptimisticOperationsTx.ts';
import { evaluateSynchronousSavepoint } from './evaluateSynchronousSavepoint.ts';

/** A replay refusal leaves input pending; defects and unexpected failures escape. */
export const replayOptimisticCommandTx = Effect.fn('replayOptimisticCommandTx')(
  function* <R>(props: {
    tx: ITx;
    contract: IContractRelease;
    appliedAt: Date;
    evaluate(tx: ITx): Effect.Effect<
      {
        result: unknown;
        operations: readonly IContractOutput[];
      },
      unknown,
      R
    >;
  }) {
    const { tx, contract, appliedAt, evaluate } = props;
    const replayed = yield* evaluateSynchronousSavepoint({
      tx,
      program: ({ tx }) =>
        Effect.gen(function* () {
          const made = yield* evaluate(tx).pipe(
            Effect.catch(failure =>
              encodeFailure(contract, failure).pipe(
                Effect.flatMap(retained =>
                  Effect.fail(
                    retained.scope !== undefined
                      ? makeZerospinError('pending-command-business-failure')
                      : makeZerospinError(retained),
                  ),
                ),
              ),
            ),
          );
          yield* encodeContractResult(contract, made.result);
          return yield* applyOptimisticOperationsTx({
            tx,
            operations: made.operations,
            operationsSchema: contract.operationsSchema,
            appliedAt,
          });
        }).pipe(Effect.scoped),
    }).pipe(Effect.exit);
    if (Exit.isSuccess(replayed)) return replayed.value;
    const reason = replayed.cause.reasons[0];
    if (
      replayed.cause.reasons.length !== 1 ||
      reason === undefined ||
      !Cause.isFailReason(reason)
    ) {
      return yield* Effect.failCause(replayed.cause);
    }
    const failure = reason.error;
    if (
      isZerospinError(failure) &&
      [
        'pending-command-business-failure',
        'operation-row-not-found',
        'operation-referential-integrity-failed',
        'service-resource-deleted',
      ].includes(failure.code)
    ) {
      return null;
    }
    return yield* Effect.fail(failure);
  },
);
