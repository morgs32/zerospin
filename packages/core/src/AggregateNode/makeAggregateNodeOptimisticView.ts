import type { Effect } from 'effect';

import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import type { ISqliteClient } from '../drizzle/types.ts';
import { makeNodeOptimisticView } from '../Node/makeNodeOptimisticView.ts';
import { replayAggregateCommandTx } from '../sessionExecution/replayAggregateCommandTx.ts';

import type { IAggregateNodeCommand } from './types.ts';

/** Bind the authored session definition once for this Node's rebuildable resource graph. */
export function makeAggregateNodeOptimisticView(props: {
  sessionDefinition: IAggregateSessionDefinition;
  openMemory?: (() => Promise<ISqliteClient>) | undefined;
  runSync<A, E>(program: Effect.Effect<A, E, unknown>): A;
}) {
  const { sessionDefinition, runSync, openMemory } = props;
  return makeNodeOptimisticView<IAggregateNodeCommand>({
    models: sessionDefinition.models,
    runSync,
    openMemory,
    replay: (tx, command) =>
      replayAggregateCommandTx({
        tx,
        definition: sessionDefinition,
        command,
        claims: command.claims,
        aggregateId: command.aggregateId,
        stagedAt: new Date(command.stagingOutcome.completedAt),
      }),
  });
}
