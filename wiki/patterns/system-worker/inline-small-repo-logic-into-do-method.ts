import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

/**
 * Inline non-public one-consumer Repo logic into the owning public method file.
 *
 * @bad Create `shared/applyOneCommand.ts` for a helper called once.
 * @bad Add a module-level helper above the public method when its only caller is that method.
 * @bad Inline a public system-worker Repo RPC method back into the class file.
 */
export const executeCommand = Effect.fn('AggregateVersionRepo.executeCommand')(
  function* (props: { command: unknown; db: IDb }) {
    return yield* makeTx('AggregateVersionRepo.executeCommand.transaction')(
      function* (tx: ITx) {
        return yield* applyCommandTx({ command: props.command, tx });
      },
    )(props.db);
  },
);

export class AggregateVersionRepo {
  async executeCommand(props: { command: unknown }) {
    return execution.runPromise(
      executeCommand({ command: props.command, db: this.db }).pipe(
        settleResult,
      ),
    );
  }

  declare db: IDb;
}

declare const execution: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const applyCommandTx: (props: {
  command: unknown;
  tx: ITx;
}) => Effect.Effect<unknown>;
declare const settleResult: (effect: unknown) => unknown;
