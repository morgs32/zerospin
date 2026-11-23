import { makeZerospinError } from '@zerospin/error';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ITx } from '../drizzle/types.ts';
import { InverseOperationSchema } from '../models/InverseOperationSchema.ts';
import { replayServiceCommandTx } from '../sessionExecution/replayServiceCommandTx.ts';
import type { IServiceSessionReplayRequirements } from '../sessionExecution/requirements.ts';

import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';
import type { IServiceSessionDefinition } from './types.ts';

/** Replay only this replica's originals not covered by its installed Node view. */
type IProps<D extends IServiceSessionDefinition = IServiceSessionDefinition> = {
  tx: ITx;
  definition: D;
  encodedClaims: Readonly<Record<string, unknown>>;
};

export function replayLocalServiceCommandsTx<
  D extends IServiceSessionDefinition,
>(
  props: IProps<D>,
): Effect.Effect<void, unknown, IServiceSessionReplayRequirements<D>>;
export function replayLocalServiceCommandsTx(
  props: IProps,
): Effect.Effect<void, unknown, unknown> {
  return Effect.fn('replayLocalServiceCommandsTx')(function* (
    props: IProps,
  ): Effect.fn.Return<void, unknown, unknown> {
    const { tx, definition, encodedClaims } = props;
    const { commands, serviceSessionMetadata: metadataTable } =
      serviceSessionRepoDbConfig.schema;
    const metadata = tx.select().from(metadataTable).get();
    if (metadata === undefined) {
      return yield* makeZerospinError('session-metadata-missing');
    }
    const rows = tx
      .select()
      .from(commands)
      .where(
        and(
          isNull(commands.serviceIndex),
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
        yield* serviceSessionRepoDbConfig.tables.commands.decodeRow(row);
      const contract = definition.contracts[command.commandName];
      if (
        contract === undefined ||
        contract.commandName !== command.commandName
      ) {
        return yield* makeZerospinError('pending-command-contract-missing');
      }
      const inverses = yield* replayServiceCommandTx({
        tx,
        definition,
        claims: encodedClaims,
        command: {
          commandName: command.commandName,
          contractVersion: contract.version,
          payload: command.payload,
          serviceName: definition.serviceName,
          kind: 'actor',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          claims: encodedClaims,
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
