import { makeZerospinError } from '@zerospin/error';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ITx } from '../drizzle/types.ts';
import { InverseOperationSchema } from '../models/InverseOperationSchema.ts';
import { replayAggregateCommandTx } from '../sessionExecution/replayAggregateCommandTx.ts';
import type { IAggregateSessionReplayRequirements } from '../sessionExecution/requirements.ts';

import { aggregateSessionRepoDbConfig } from './aggregateSessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition } from './types.ts';

/** Replay only this replica's originals not covered by its installed Node view. */
type IProps<
  D extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  tx: ITx;
  definition: D;
  aggregateId: string;
  claims: Readonly<Record<string, unknown>>;
};

export function replayLocalAggregateCommandsTx<
  D extends IAggregateSessionDefinition,
>(
  props: IProps<D>,
): Effect.Effect<void, unknown, IAggregateSessionReplayRequirements<D>>;
export function replayLocalAggregateCommandsTx(
  props: IProps,
): Effect.Effect<void, unknown, unknown> {
  return Effect.fn('replayLocalAggregateCommandsTx')(function* (
    props: IProps,
  ): Effect.fn.Return<void, unknown, unknown> {
    const { tx, definition, aggregateId, claims } = props;
    const { commands, sessionMetadata: metadataTable } =
      aggregateSessionRepoDbConfig.schema;
    const metadata = tx.select().from(metadataTable).get();
    if (metadata === undefined) {
      return yield* makeZerospinError('session-metadata-missing');
    }
    const rows = tx
      .select()
      .from(commands)
      .where(
        and(
          isNull(commands.aggregateIndex),
          or(
            isNull(commands.nodeIndex),
            gt(commands.nodeIndex, metadata.afterNodeIndex),
          ),
        ),
      )
      .orderBy(commands.sessionIndex)
      .all();
    for (const row of rows) {
      const command =
        yield* aggregateSessionRepoDbConfig.tables.commands.decodeRow(row);
      const contract = definition.contracts[command.commandName];
      if (
        contract === undefined ||
        contract.commandName !== command.commandName
      ) {
        return yield* makeZerospinError('pending-command-contract-missing');
      }
      const inverses = yield* replayAggregateCommandTx({
        tx,
        definition,
        aggregateId,
        claims,
        command: {
          commandName: command.commandName,
          contractVersion: contract.version,
          payload: command.payload,
          aggregateId,
          aggregateName: definition.aggregateName,
          aggregateVersion: definition.aggregateVersion,
          kind: 'actor',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          claims,
          sessionId: metadata.sessionId,
          sessionName: definition.sessionName,
        },
        stagedAt: command.stagingOutcome.completedAt,
      });
      tx.update(commands)
        .set({
          inverseOperations:
            inverses === null
              ? null
              : yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.Array(InverseOperationSchema)),
                )(inverses),
        })
        .where(eq(commands.sessionIndex, command.sessionIndex))
        .run();
    }
  })(props);
}
