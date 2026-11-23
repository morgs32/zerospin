import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { fenceTransaction } from '../fenceTransaction.ts';
import type { IDb, IDbConfig, ITx } from '../types.ts';

let inTxAlready = false;

/** Define a synchronous transaction program receiving its transaction directly. */
export function makeTx(name: string) {
  return function <
    CONFIG extends IDbConfig,
    ARGS extends unknown[],
    SUCCESS,
    YIELD extends Effect.Effect<unknown, unknown, unknown>,
  >(
    program: ((
      tx: ITx<CONFIG>,
      ...args: ARGS
    ) => Generator<YIELD, SUCCESS, unknown>) &
      ([Extract<SUCCESS, PromiseLike<unknown>>] extends [never]
        ? unknown
        : never),
  ) {
    type ITransactionError =
      | ([YIELD] extends [never]
          ? never
          : [YIELD] extends [Effect.Effect<unknown, infer E, unknown>]
            ? E
            : never)
      | IZerospinError<'drizzle-transaction-failed'>;
    type ITransactionServices = [YIELD] extends [never]
      ? never
      : [YIELD] extends [Effect.Effect<unknown, unknown, infer R>]
        ? R
        : never;
    return makeFn(name)((db: IDb<CONFIG>, ...args: ARGS) => {
      const effect = Effect.gen(function* (): Effect.fn.Return<
        SUCCESS,
        ITransactionError,
        ITransactionServices
      > {
        const body = (tx: ITx<CONFIG>) =>
          Effect.gen(() => program(tx, ...args));
        const context =
          yield* Effect.context<Effect.Services<ReturnType<typeof body>>>();
        const rollback = new Error('transaction-rollback');
        let captured:
          | Exit.Exit<SUCCESS, Effect.Error<ReturnType<typeof body>>>
          | undefined;
        const exit = yield* Effect.try({
          try: () => {
            if (inTxAlready) {
              throw new Error('nested-transaction-not-allowed');
            }
            try {
              return db.transaction(nativeTx => {
                const transaction = fenceTransaction(nativeTx);
                inTxAlready = true;
                try {
                  const exit = runSynchronousExit(
                    body(transaction.tx),
                    Effect.runSyncExitWith(context),
                    transaction.close,
                  );
                  if (Exit.isFailure(exit)) {
                    transaction.close();
                    captured = exit;
                    throw rollback;
                  }
                  return exit;
                } finally {
                  // Committed observers may start a new transaction after SQL and
                  // capture cleanup; only the running transaction body is nested.
                  transaction.close();
                  inTxAlready = false;
                }
              });
            } catch (cause) {
              // Only the exact sentinel can turn a completed rollback into a result.
              if (cause === rollback && captured !== undefined) return captured;
              // oxlint-disable-next-line eslint/no-throw-literal -- Preserve the original transaction failure for Effect.try.
              throw cause;
            }
          },
          catch: error => {
            return makeZerospinError({
              code: 'drizzle-transaction-failed',
              message: `Failed to run database transaction: ${error}`,
              cause: prettyUnknownFailure({
                sqlFailure: error,
                executionCause:
                  captured && Exit.isFailure(captured)
                    ? captured.cause
                    : undefined,
              }),
            });
          },
        });
        if (Exit.isSuccess(exit)) return exit.value;
        // SQL rollback succeeded: propagate every execution reason unchanged.
        return yield* Effect.failCause(exit.cause);
      });
      return effect;
    });
  };
}

/** Evaluate against a disposable SQL transaction and propagate its complete failure Cause. */
export const rehearse = Effect.fn('rehearse')(function* <
  CONFIG extends IDbConfig,
  ERROR,
  SERVICES,
>(
  db: IDb<CONFIG>,
  program: (tx: ITx<CONFIG>) => Effect.Effect<unknown, ERROR, SERVICES>,
): Effect.fn.Return<
  void,
  ERROR | IZerospinError<'drizzle-transaction-failed'>,
  SERVICES
> {
  const context = yield* Effect.context<SERVICES>();
  const rollback = new Error('rehearsal-rollback');
  let captured: Exit.Exit<unknown, ERROR> | undefined;
  const exit = yield* Effect.try({
    try: () => {
      if (inTxAlready) throw new Error('nested-transaction-not-allowed');
      try {
        return db.transaction(nativeTx => {
          const transaction = fenceTransaction(nativeTx);
          inTxAlready = true;
          try {
            captured = runSynchronousExit(
              Effect.suspend(() => program(transaction.tx)),
              Effect.runSyncExitWith(context),
              transaction.close,
            );
            throw rollback;
          } finally {
            transaction.close();
            inTxAlready = false;
          }
        });
      } catch (cause) {
        if (cause === rollback && captured !== undefined) return captured;
        // oxlint-disable-next-line eslint/no-throw-literal -- Preserve the original transaction failure for Effect.try.
        throw cause;
      }
    },
    catch: error =>
      makeZerospinError({
        code: 'drizzle-transaction-failed',
        message: `Failed to rehearse database transaction: ${error}`,
        cause: prettyUnknownFailure({
          sqlFailure: error,
          executionCause:
            captured && Exit.isFailure(captured)
              ? captured.cause
              : undefined,
        }),
      }),
  });
  if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
});
