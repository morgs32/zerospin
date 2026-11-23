import type { Effect } from 'effect';

import type { ISqliteClient } from '../drizzle/types.ts';
import { makeNodeOptimisticView } from '../Node/makeNodeOptimisticView.ts';
import type { IServiceSessionDefinition } from '../serviceSession/types.ts';
import { replayServiceCommandTx } from '../sessionExecution/replayServiceCommandTx.ts';

import type { IServiceNodeCommand } from './types.ts';

/** Bind the authored session definition once for this Node's rebuildable resource graph. */
export function makeServiceNodeOptimisticView(props: {
  sessionDefinition: IServiceSessionDefinition;
  openMemory?: (() => Promise<ISqliteClient>) | undefined;
  runSync<A, E>(program: Effect.Effect<A, E, unknown>): A;
}) {
  const { sessionDefinition, runSync, openMemory } = props;
  return makeNodeOptimisticView<IServiceNodeCommand>({
    models: sessionDefinition.models,
    runSync,
    openMemory,
    replay: (tx, command) =>
      replayServiceCommandTx({
        tx,
        definition: sessionDefinition,
        command,
        claims: command.claims,
        stagedAt: new Date(command.stagingOutcome.completedAt),
      }),
  });
}
