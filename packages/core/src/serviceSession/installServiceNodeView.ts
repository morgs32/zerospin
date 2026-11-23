import { makeZerospinError } from '@zerospin/error';
import { eq, isNotNull, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import { makeEncodedRowFromResource } from '../Node/resourceEnvelope.ts';
import { hasServiceNodeCheckpoint } from '../ServiceNode/hasServiceNodeCheckpoint.ts';
import type { IServiceNodeSnapshot } from '../ServiceNode/ServiceNode.ts';
import type { IServiceSessionReplayRequirements } from '../sessionExecution/requirements.ts';

import { replayLocalServiceCommandsTx } from './replayLocalServiceCommandsTx.ts';
import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';
import type {
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
} from './types.ts';

/** Install one captured Node view and rebuild only uncovered local overlays. */
type IProps<D extends IServiceSessionDefinition = IServiceSessionDefinition> = {
  db: IServiceSessionDrizzleDb;
  definition: D;

  sessionId: `sesn_${string}`;
  snapshot: IServiceNodeSnapshot;
  discardPending?: boolean;
  replaceCheckpoint?: boolean;
};

export function installServiceNodeView<D extends IServiceSessionDefinition>(
  props: IProps<D>,
): Effect.Effect<
  typeof serviceSessionRepoDbConfig.schema.serviceSessionMetadata.$inferSelect,
  unknown,
  IServiceSessionReplayRequirements<D>
>;
export function installServiceNodeView(
  props: IProps,
): Effect.Effect<
  typeof serviceSessionRepoDbConfig.schema.serviceSessionMetadata.$inferSelect,
  unknown,
  unknown
> {
  return Effect.fn('installServiceNodeView')(function* (
    props: IProps,
  ): Effect.fn.Return<
    typeof serviceSessionRepoDbConfig.schema.serviceSessionMetadata.$inferSelect,
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
    return yield* makeTx('installServiceNodeView')(function* (tx: ITx) {
      const { commands, serviceSessionMetadata: metadataTable } =
        serviceSessionRepoDbConfig.schema;
      const checkpoint = snapshot.metadata;
      if (
        !hasServiceNodeCheckpoint(checkpoint) ||
        !Number.isSafeInteger(snapshot.nodeIndex) ||
        snapshot.nodeIndex < 0 ||
        snapshot.identity.systemName !== definition.systemName ||
        snapshot.identity.serviceName !== definition.serviceName ||
        snapshot.identity.serviceVersion !== definition.serviceVersion ||
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
      if (
        !discardPending &&
        !replaceCheckpoint &&
        before !== undefined &&
        (snapshot.nodeIndex < before.afterNodeIndex ||
          checkpoint.serviceIndex < before.serviceIndex ||
          (checkpoint.serviceIndex === before.serviceIndex &&
            checkpoint.dispositionChainHash !== before.dispositionChainHash))
      ) {
        return yield* makeZerospinError('session-snapshot-checkpoint-conflict');
      }
      const retained = discardPending ? [] : tx.select().from(commands).all();
      const completed = new Map(
        (replaceCheckpoint
          ? retained.filter(row => row.serviceIndex !== null)
          : []
        ).map(row => [row.sessionIndex, row]),
      );
      const rows = replaceCheckpoint
        ? retained.filter(row => row.serviceIndex === null)
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
            resolution.serviceIndex > checkpoint.serviceIndex ||
            (row.serviceIndex !== null &&
              (row.serviceIndex !== resolution.serviceIndex ||
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
          row.serviceIndex === null &&
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
        tx.delete(commands).where(isNotNull(commands.serviceIndex)).run();
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
                  serviceIndex: resolution.serviceIndex,
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
          lastSessionIndex: before?.lastSessionIndex ?? 0,
          afterNodeIndex: snapshot.nodeIndex,
          serviceIndex: checkpoint.serviceIndex,
          dispositionChainHash: checkpoint.dispositionChainHash,
        })
        .run();
      yield* replayLocalServiceCommandsTx({
        tx,
        definition,
        encodedClaims: snapshot.identity.claims,
      });
      return tx.select().from(metadataTable).get()!;
    })(db);
  })(props);
}
