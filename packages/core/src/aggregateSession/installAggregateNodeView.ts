import { makeZerospinError } from '@zerospin/error';
import { eq, isNotNull, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import type { IAggregateNodeSnapshot } from '../AggregateNode/AggregateNode.ts';
import { hasAggregateNodeCheckpoint } from '../AggregateNode/hasAggregateNodeCheckpoint.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import { makeEncodedRowFromResource } from '../Node/resourceEnvelope.ts';
import type { IAggregateSessionReplayRequirements } from '../sessionExecution/requirements.ts';

import { aggregateSessionRepoDbConfig } from './aggregateSessionRepoDbConfig.ts';
import { replayLocalAggregateCommandsTx } from './replayLocalAggregateCommandsTx.ts';
import type {
  IAggregateSessionDefinition,
  IAggregateSessionDrizzleDb,
  ISessionId,
} from './types.ts';

/** Install one captured Node view and rebuild only uncovered local overlays. */
type IProps<
  D extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  db: IAggregateSessionDrizzleDb;
  definition: D;
  sessionId: ISessionId;
  snapshot: IAggregateNodeSnapshot;
  discardPending?: boolean;
  replaceCheckpoint?: boolean;
};

export function installAggregateNodeView<D extends IAggregateSessionDefinition>(
  props: IProps<D>,
): Effect.Effect<
  typeof aggregateSessionRepoDbConfig.schema.sessionMetadata.$inferSelect,
  unknown,
  IAggregateSessionReplayRequirements<D>
>;
export function installAggregateNodeView(
  props: IProps,
): Effect.Effect<
  typeof aggregateSessionRepoDbConfig.schema.sessionMetadata.$inferSelect,
  unknown,
  unknown
> {
  return Effect.fn('installAggregateNodeView')(function* (
    props: IProps,
  ): Effect.fn.Return<
    typeof aggregateSessionRepoDbConfig.schema.sessionMetadata.$inferSelect,
    unknown,
    unknown
  > {
    const {
      db,
      definition,
      snapshot,
      discardPending = false,
      replaceCheckpoint = false,
      sessionId,
    } = props;
    return yield* makeTx('installAggregateNodeView')(function* (tx: ITx) {
      const { commands, sessionMetadata: metadataTable } =
        aggregateSessionRepoDbConfig.schema;
      const checkpoint = snapshot.metadata;
      if (
        !hasAggregateNodeCheckpoint(checkpoint) ||
        !Number.isSafeInteger(snapshot.nodeIndex) ||
        snapshot.nodeIndex < 0 ||
        snapshot.identity.systemName !== definition.systemName ||
        snapshot.identity.aggregateName !== definition.aggregateName ||
        snapshot.identity.aggregateVersion !== definition.aggregateVersion ||
        snapshot.identity.actorName !== definition.actorName ||
        snapshot.identity.actorVersion !== definition.actorVersion ||
        snapshot.identity.sessionName !== definition.sessionName
      ) {
        return yield* makeZerospinError('session-snapshot-identity-conflict');
      }
      const metadataRows = tx.select().from(metadataTable).all();
      if (metadataRows.length > 1) {
        return yield* makeZerospinError('session-metadata-ambiguous');
      }
      const before = metadataRows[0];
      if (before !== undefined && before.sessionId !== sessionId) {
        return yield* makeZerospinError('session-snapshot-identity-conflict');
      }
      if (
        !discardPending &&
        !replaceCheckpoint &&
        before !== undefined &&
        (snapshot.nodeIndex < before.afterNodeIndex ||
          checkpoint.aggregateIndex < before.aggregateIndex ||
          (checkpoint.aggregateIndex === before.aggregateIndex &&
            checkpoint.dispositionChainHash !== before.dispositionChainHash))
      ) {
        return yield* makeZerospinError('session-snapshot-checkpoint-conflict');
      }
      const retained = discardPending ? [] : tx.select().from(commands).all();
      const completed = new Map(
        (replaceCheckpoint
          ? retained.filter(row => row.aggregateIndex !== null)
          : []
        ).map(row => [row.sessionIndex, row]),
      );
      const rows = replaceCheckpoint
        ? retained.filter(row => row.aggregateIndex === null)
        : retained;
      // Completed replica rows are derived evidence; pending original coordinates remain immutable.
      const commandCoverage = snapshot.commandCoverage.filter(coverage => {
        const previous = completed.get(coverage.sessionIndex);
        if (previous === undefined) return true;
        if (
          coverage.sessionId !== sessionId ||
          coverage.commandName !== previous.commandName ||
          coverage.nodeId !== previous.nodeId ||
          coverage.nodeIndex !== previous.nodeIndex ||
          coverage.pushIndex !== previous.pushIndex
        ) {
          throw makeZerospinError('session-staged-coordinate-conflict');
        }
        return false;
      });
      const own = new Map(rows.map(row => [row.sessionIndex, row]));
      const covered = new Set<number>();
      for (const coverage of commandCoverage) {
        const row = own.get(coverage.sessionIndex);
        if (
          row === undefined ||
          row.commandName !== coverage.commandName ||
          covered.has(coverage.sessionIndex)
        ) {
          return yield* makeZerospinError(
            'session-snapshot-pending-partition-invalid',
          );
        }
        covered.add(coverage.sessionIndex);
        if (
          coverage.sessionId !== sessionId ||
          (coverage.nodeIndex !== null &&
            (coverage.nodeIndex > snapshot.nodeIndex ||
              coverage.nodeId !== checkpoint.nodeId)) ||
          (row.nodeId !== null &&
            (row.nodeId !== coverage.nodeId ||
              row.nodeIndex !== coverage.nodeIndex ||
              row.pushIndex !== coverage.pushIndex))
        ) {
          return yield* makeZerospinError('session-staged-coordinate-conflict');
        }
        const resolution = coverage.resolution;
        if (
          coverage.nodeId !== null &&
          resolution !== null &&
          (resolution.id !==
            makeNodeCommandId(coverage.nodeId, coverage.pushIndex) ||
            resolution.commandName !== row.commandName ||
            resolution.aggregateIndex > checkpoint.aggregateIndex ||
            (row.aggregateIndex !== null &&
              (row.aggregateIndex !== resolution.aggregateIndex ||
                !isEqual(
                  row.failure === null ? null : JSON.parse(row.failure),
                  resolution.failure,
                ))))
        ) {
          return yield* makeZerospinError('session-snapshot-receipt-invalid');
        }
      }
      for (const row of rows) {
        if (
          (row.nodeId === null) !== (row.pushIndex === null) ||
          (row.nodeId === null) !== (row.nodeIndex === null) ||
          (row.nodeIndex !== null &&
            (!Number.isSafeInteger(row.nodeIndex) ||
              row.nodeIndex < 1 ||
              row.pushIndex === null ||
              !Number.isSafeInteger(row.pushIndex) ||
              row.pushIndex < 1))
        ) {
          return yield* makeZerospinError('session-staged-coordinate-conflict');
        }
        if (row.nodeId !== null && row.nodeId !== checkpoint.nodeId) {
          return yield* makeZerospinError('node-epoch-changed');
        }
        if (
          row.aggregateIndex === null &&
          row.nodeIndex !== null &&
          row.nodeIndex <= snapshot.nodeIndex &&
          !covered.has(row.sessionIndex)
        ) {
          return yield* makeZerospinError(
            'session-snapshot-pending-partition-invalid',
          );
        }
      }
      const resources = snapshot.resources.map(resource => {
        const model = definition.models[resource.modelName];
        if (model === undefined) {
          throw makeZerospinError('node-resource-model-invalid');
        }
        return { model, row: makeEncodedRowFromResource(resource, model) };
      });
      tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
      if (discardPending) {
        tx.delete(commands).run();
        tx.delete(metadataTable).run();
      } else if (replaceCheckpoint) {
        tx.delete(commands).where(isNotNull(commands.aggregateIndex)).run();
      }
      for (const model of Object.values(definition.models)) {
        tx.delete(model.drizzleSchema).run();
      }
      tx.update(commands).set({ inverseOperations: null }).run();
      for (const resource of resources) {
        tx.insert(resource.model.drizzleSchema).values(resource.row).run();
      }
      for (const coverage of commandCoverage) {
        const resolution = coverage.resolution;
        tx.update(commands)
          .set({
            nodeId: coverage.nodeId,
            nodeIndex: coverage.nodeIndex,
            pushIndex: coverage.pushIndex,
            ...(resolution === null
              ? {}
              : {
                  aggregateIndex: resolution.aggregateIndex,
                  failure:
                    resolution.failure === null
                      ? null
                      : JSON.stringify(resolution.failure),
                }),
          })
          .where(eq(commands.sessionIndex, coverage.sessionIndex))
          .run();
      }
      tx.delete(metadataTable).run();
      tx.insert(metadataTable)
        .values({
          sessionId,
          lastSessionIndex: before?.lastSessionIndex ?? 0,
          afterNodeIndex: snapshot.nodeIndex,
          aggregateIndex: checkpoint.aggregateIndex,
          dispositionChainHash: checkpoint.dispositionChainHash,
        })
        .run();
      yield* replayLocalAggregateCommandsTx({
        tx,
        definition,
        aggregateId: snapshot.identity.aggregateId,
        claims: snapshot.identity.claims,
      });
      return tx.select().from(metadataTable).get()!;
    })(db);
  })(props);
}
