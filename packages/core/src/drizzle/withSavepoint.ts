import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from "@zerospin/error";
import { runSynchronousExit, type IAnyDrizzleSchemas } from "@zerospin/shapes";
import type { AnyRelations } from "drizzle-orm";
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { fenceTransaction } from "./fenceTransaction.ts";
import type { IDbConfig, ITx } from "./types.ts";

export const withSavepoint = Effect.fn("withSavepoint")(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
  SUCCESS,
  ERROR,
  PROGRAM_REQUIREMENTS,
>(
  props: {
    tx: ITx<IDbConfig<SCHEMA, RELATIONS>>;
    program: (props: {
      tx: ITx<IDbConfig<SCHEMA, RELATIONS>>;
    }) => Effect.Effect<SUCCESS, ERROR, PROGRAM_REQUIREMENTS>;
  } & ([Extract<SUCCESS, PromiseLike<unknown>>] extends [never]
    ? unknown
    : never),
): Effect.fn.Return<
  SUCCESS,
  ERROR | IZerospinError<"drizzle-savepoint-failed">,
  PROGRAM_REQUIREMENTS
> {
  const { program, tx } = props;
  const context = yield* Effect.context<PROGRAM_REQUIREMENTS>();

  const rollback = new Error("savepoint-rollback");
  let captured: Exit.Exit<SUCCESS, ERROR> | undefined;
  const exit = yield* Effect.try({
    try: () => {
      try {
        return tx.transaction((savepointTx) => {
          const transaction = fenceTransaction(savepointTx);
          try {
            const exit = runSynchronousExit(
              program({ tx: transaction.tx }),
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
            transaction.close();
          }
        });
      } catch (cause) {
        if (cause === rollback && captured !== undefined) return captured;
        // oxlint-disable-next-line eslint/no-throw-literal -- Preserve the original savepoint failure for Effect.try.
        throw cause;
      }
    },
    catch: (cause) => {
      return makeZerospinError({
        code: "drizzle-savepoint-failed",
        message: `Failed to run database savepoint: ${prettyUnknownFailure(cause)}`,
        cause: prettyUnknownFailure({
          sqlFailure: cause,
          executionCause:
            captured && Exit.isFailure(captured) ? captured.cause : undefined,
        }),
      });
    },
  });
  if (Exit.isSuccess(exit)) return exit.value;
  // SQL rollback succeeded: propagate every execution reason unchanged.
  return yield* Effect.failCause(exit.cause);
});
