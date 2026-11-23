import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinErrorJson,
  type PublicFailureSchema,
} from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  makeShapeCodecs,
} from '@zerospin/shapes';
import { and, eq, gt, isNotNull, isNull, not, sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type {
  IAggregateExposedCommand,
  IAggregateSessionDefinition,
} from '../aggregateSession/types.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { compileSqliteTableDefinition } from '../drizzle/definition/compileSqliteTableDefinition.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { assertSameNodeCommand } from '../Node/assertSameNodeCommand.ts';
import { encodeNodeFailure } from '../Node/encodeNodeFailure.ts';
import { hasNodeCommandFinal } from '../Node/hasNodeCommandFinal.ts';
import type { INodeOptimisticView } from '../Node/makeNodeOptimisticView.ts';
import { makeNodeResourceTables } from '../Node/makeNodeResourceTables.ts';
import { makeNodeSqlGate } from '../Node/makeNodeSqlGate.ts';
import { makeNodeSubscriptions } from '../Node/makeNodeSubscriptions.ts';
import type { INodeRetention } from '../Node/NodeCommandCoverage.ts';
import { nodeStorageUpgradeError } from '../Node/nodeStorageUpgradeError.ts';
import {
  connectedReadDeclarations,
  readBaselineResolvedThrough,
  rebuildConnectedReadTablesTx,
  retainConnectedReadBaselineTx,
} from '../Node/rebuildConnectedReadTables.ts';
import {
  makeEncodedRowFromResource,
  makeResourceFromEncodedRow,
} from '../Node/resourceEnvelope.ts';
import { sessionKey } from '../Node/sessionKey.ts';
import { sessionSubmissionKey } from '../Node/sessionSubmissionKey.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';

import { acceptAggregateOriginalTx } from './acceptAggregateOriginalTx.ts';
import type { AggregateNodeCommandCoverageSchema } from './AggregateNodeCommandSchema.ts';
import { aggregateNodeDatabase } from './aggregateNodeDatabase.ts';
import {
  aggregateNodeTables,
  type aggregateNodeCommands,
  type aggregateNodeMetadata,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';
import { hasAggregateNodeCheckpoint } from './hasAggregateNodeCheckpoint.ts';
import { readAggregateNodeIndexes } from './readAggregateNodeIndexes.ts';
import { readAggregateNodeMetadata } from './readAggregateNodeMetadata.ts';
import { readAggregateNodeOutcomeIndex } from './readAggregateNodeOutcomeIndex.ts';
import {
  readAggregateFinalCommand,
  readAggregateNodeCommand,
} from './readAggregateNodeRecord.ts';
import { retainAggregateFinalTx } from './retainAggregateFinalTx.ts';
import {
  adoptPublishedAggregateCommandStorageTx,
  checkPublishedAggregateJournal,
  checkPublishedJournalOriginal,
  type IAggregateJournalOriginal,
  type ICheckAggregateJournal,
} from './storage/adoptPublishedAggregateCommandStorageTx.ts';
import { publishedAggregateNodeTables } from './storage/publishedAggregateNodeTables.ts';
import type {
  IAggregateNodeBaseline,
  IAggregateNodeCommand,
  IAggregateNodeDefinition,
} from './types.ts';

export type IAggregateNodeCommandRow =
  typeof aggregateNodeCommands.$inferSelect;
export type IAggregateNodeSnapshot = Readonly<{
  identity: IAggregateNodeDefinition['identity'];
  state: ReturnType<AggregateNode['status']>;
  metadata: typeof aggregateNodeMetadata.$inferSelect;
  nodeIndex: number;
  pushIndex: number;
  outcomeIndex: number;
  resources: readonly IEncodedResourceShape[];
  commandCoverage: readonly (typeof AggregateNodeCommandCoverageSchema.Type)[];
}>;
export type IAggregateNodeState = ReturnType<AggregateNode['status']> &
  Readonly<{
    nodeId: string;
    nodeIndex: number;
    pushIndex: number;
    admittedThroughPushIndex: number;
    outcomeIndex: number;
    pushPaused: boolean;
  }>;
export type IAggregateNodeSink = Readonly<{
  view(snapshot: IAggregateNodeSnapshot, generation?: number): Promise<void>;
  reset?(options?: {
    preservePending?: boolean;
    generation?: number;
  }): Promise<void>;
  state(state: IAggregateNodeState, generation?: number): Promise<void>;
}>;
/** Owns immutable aggregate command records, resources, and delivery progress. */
export class AggregateNode {
  private readonly gate;
  private readonly subscriptions;
  private closing: Promise<void> | undefined;
  private readonly tables;
  private readonly readTableDefinitions;
  private persistenceFailure: unknown = null;
  private connected = false;
  private connectedRecoveryHandler: ((failure: unknown) => boolean) | undefined;
  private resetInProgress = false;
  private mutationGeneration = 0;
  private projectionFailure: unknown = null;
  private projected:
    | { key: string; resources: readonly IEncodedResourceShape[] }
    | undefined;
  private checkpointConflict: unknown = null;
  private authenticationRejected = false;
  private authenticationState = 'remembered';
  private suspended = false;
  private synchronization = 'offline';
  private connectionFailure: IZerospinErrorJson | null = null;
  private admissionRejection: {
    commandId: string;
    commandName: string;
    failure: typeof PublicFailureSchema.Type;
  } | null = null;

  private get nodeTables(): IAggregateNodeTables {
    return this.connected ? aggregateNodeTables : publishedAggregateNodeTables;
  }

  constructor(
    readonly db: SqliteRemoteDatabase,
    readonly definition: IAggregateNodeDefinition,
    private readonly optimisticView: INodeOptimisticView<
      Extract<IAggregateNodeCommand, { nodeId: string }>
    >,
    private readonly sessionDefinition: IAggregateSessionDefinition,
    private readonly standalone?: {
      storageKey: string;
      validate(command: IAggregateNodeCommand): Promise<void>;
    },
  ) {
    this.tables = makeNodeResourceTables(sessionDefinition.models);
    this.readTableDefinitions = Object.values(this.tables).map(table =>
      compileSqliteTableDefinition(table),
    );
    this.gate = makeNodeSqlGate(db, cause => {
      this.persistenceFailure = cause;
      if (!this.deferConnectedRecovery(cause)) this.subscriptions.publish();
    });
    this.subscriptions = makeNodeSubscriptions<
      IAggregateNodeSnapshot,
      IAggregateNodeState
    >({
      readState: () =>
        this.gate.run(async () => {
          const metadata = await readAggregateNodeMetadata(
            this.db,
            this.nodeTables,
          );
          const indexes = await readAggregateNodeIndexes(
            this.db,
            this.nodeTables,
          );
          const outcomeIndex = await readAggregateNodeOutcomeIndex(
            this.db,
            this.nodeTables,
          );
          return {
            ...this.status(),
            nodeId: metadata.nodeId,
            nodeIndex: indexes.nodeIndex,
            pushIndex: indexes.pushIndex,
            admittedThroughPushIndex: metadata.admittedThroughPushIndex,
            outcomeIndex,
            pushPaused: metadata.pushPaused,
          };
        }),
    });
  }

  /** Fence synchronously, cancel remote waits, then join admitted SQL before storage closes. */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.gate.preventNewWork();
    this.subscriptions.cancel();
    this.closing = (async () => {
      try {
        await this.subscriptions.drainLocalTasks();
      } finally {
        try {
          await this.gate.drain();
        } finally {
          this.optimisticView.close();
        }
      }
    })();
    return this.closing;
  }

  async initializeConnectedStorage(
    create = true,
    readBaseline?: IAggregateNodeBaseline,
    checkJournal?: ICheckAggregateJournal,
  ): Promise<{ created: boolean }> {
    if (this.standalone !== undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    this.connected = true;
    return this.gate
      .run(async () => {
        const retainedSessionKey = await sessionKey(this.definition.identity);
        connectedReadDeclarations(
          this.readTableDefinitions,
          this.sessionDefinition.models,
        );
        const checkedJournalNodeId = checkJournal
          ? await checkPublishedAggregateJournal(
              this.db,
              retainedSessionKey,
              this.definition,
              checkJournal,
            )
          : undefined;
        const opened = await aggregateNodeDatabase.initializeSchema(this.db, {
          transaction: this.gate.transaction,
          create,
          readTables: this.readTableDefinitions,
          verifyBinding: async () => {
            // These binding columns identify the file before a pending step changes any other column.
            const bindings = await this.db.all<{
              sessionKey: string;
              aggregateId: string;
            }>(sql`SELECT sessionKey, aggregateId FROM nodeMetadata LIMIT 2`);
            const [stored] = bindings;
            if (
              bindings.length !== 1 ||
              !stored ||
              stored.sessionKey !== retainedSessionKey ||
              stored.aggregateId !== this.definition.identity.aggregateId
            ) {
              throw makeZerospinError('node-storage-identity-mismatch');
            }
          },
          initializeProducer: () => this.insertProducer(retainedSessionKey),
          adoptPublished: () =>
            adoptPublishedAggregateCommandStorageTx(this.db, {
              resources: this.readTableDefinitions,
              checkedJournalNodeId,
            }),
        });
        await this.gate.transaction(async () => {
          const metadata = await readAggregateNodeMetadata(
            this.db,
            this.nodeTables,
          );
          if (!create && !hasAggregateNodeCheckpoint(metadata)) {
            throw makeZerospinError('node-storage-incomplete');
          }
          await this.openConnectedReadTables(metadata, readBaseline);
        });
        return opened;
      })
      .catch(failure => {
        throw nodeStorageUpgradeError(failure);
      });
  }

  private clearConnectedRecoveryState() {
    this.persistenceFailure = null;
    this.projectionFailure = null;
    this.projected = undefined;
    this.checkpointConflict = null;
    this.synchronization = 'offline';
    this.connectionFailure = null;
    this.admissionRejection = null;
  }

  async initialize(
    create = true,
    replacement?: IAggregateNodeBaseline,
  ): Promise<boolean> {
    return this.gate.run(async () => {
      const replaceStorage = replacement !== undefined;
      if (replaceStorage && this.standalone === undefined) {
        throw makeZerospinError('standalone-storage-reset-required');
      }
      const storedTables = await this.db.values<[string]>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      );
      const retainedSessionKey =
        this.standalone?.storageKey ??
        (await sessionKey(this.definition.identity));
      if (replaceStorage) await this.db.run(sql`PRAGMA foreign_keys = OFF`);
      try {
        return await this.gate.transaction(async () => {
          const [version] = await this.db.values<[number]>(
            sql`PRAGMA user_version`,
          );
          const resources = this.readTableDefinitions;
          if (storedTables.length > 0) {
            if (version?.[0] !== 22) {
              throw makeZerospinError('node-storage-reset-required');
            }
            const metadata = await readAggregateNodeMetadata(
              this.db,
              this.nodeTables,
            );
            if (metadata.aggregateId !== this.definition.identity.aggregateId) {
              throw makeZerospinError(
                this.standalone === undefined
                  ? 'node-storage-identity-mismatch'
                  : 'standalone-storage-identity-mismatch',
              );
            }
            if (!replaceStorage) {
              if (metadata.sessionKey !== retainedSessionKey) {
                throw makeZerospinError(
                  this.standalone === undefined
                    ? 'node-storage-identity-mismatch'
                    : 'standalone-storage-identity-mismatch',
                );
              }
              if (!create && !hasAggregateNodeCheckpoint(metadata)) {
                throw makeZerospinError('node-storage-incomplete');
              }
              return false;
            }
          }
          if (!create) {
            throw makeZerospinError('node-storage-missing');
          }
          if (replaceStorage) {
            for (const [name] of storedTables) {
              await this.db.run(
                sql.raw(`DROP TABLE "${name.replaceAll('"', '""')}"`),
              );
            }
          }
          const currentTables = [
            publishedAggregateNodeTables.metadata,
            publishedAggregateNodeTables.commands,
          ].map(table => compileSqliteTableDefinition(table));
          for (const physicalDefinition of [...currentTables, ...resources]) {
            for (const statement of [
              physicalDefinition.createTable,
              ...physicalDefinition.indexes.map(index => index.sql),
            ]) {
              await this.db.run(sql.raw(statement));
            }
          }
          await this.insertProducer(retainedSessionKey);
          await this.db.run(sql`PRAGMA user_version = 22`);
          if (replacement !== undefined) {
            await this.initializeBaselineTx(replacement);
          }
          return true;
        });
      } finally {
        if (replaceStorage) await this.db.run(sql`PRAGMA foreign_keys = ON`);
      }
    });
  }

  private async insertProducer(retainedSessionKey: string) {
    await this.db.insert(this.nodeTables.metadata).values({
      nodeId: await Effect.runPromise(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.node,
        }).pipe(Effect.provide(NanoIdFactory)),
      ),
      aggregateId: this.definition.identity.aggregateId,
      sessionKey: retainedSessionKey,
      admittedThroughPushIndex: 0,
      aggregateIndex: null,
      dispositionChainHash: null,
      pushPaused: false,
    });
  }

  private async openConnectedReadTables(
    metadata: typeof this.nodeTables.metadata.$inferSelect,
    fresh?: IAggregateNodeBaseline,
  ) {
    const restored = await rebuildConnectedReadTablesTx({
      db: this.db,
      tables: this.tables,
      models: this.sessionDefinition.models,
      definitions: this.readTableDefinitions,
      nodeId: metadata.nodeId,
      positionColumn: 'aggregateIndex',
      position: metadata.aggregateIndex,
      dispositionChainHash: metadata.dispositionChainHash,
      fresh:
        fresh === undefined
          ? undefined
          : { ...fresh, position: fresh.aggregateIndex },
      readOriginalProgress: async () => ({
        pushIndex: (await readAggregateNodeIndexes(this.db, this.nodeTables))
          .pushIndex,
        outcomeIndex: await readAggregateNodeOutcomeIndex(
          this.db,
          this.nodeTables,
        ),
      }),
      readResources: () => this.readAuthoritativeResources(),
    });
    if (restored.position !== metadata.aggregateIndex) {
      await this.db.update(this.nodeTables.metadata).set({
        aggregateIndex: restored.position,
        dispositionChainHash: restored.dispositionChainHash,
      });
    }
  }

  private async retainReadBaseline(
    nodeId: string,
    baseline: IAggregateNodeBaseline,
  ) {
    if (!this.connected) return;
    const declarations = connectedReadDeclarations(
      this.readTableDefinitions,
      this.sessionDefinition.models,
    );
    await retainConnectedReadBaselineTx(this.db, nodeId, declarations, {
      ...baseline,
      position: baseline.aggregateIndex,
    });
  }

  /** A baseline is installed exactly once; reconnect always resumes committed commands. */
  async initializeBaseline(baseline: IAggregateNodeBaseline): Promise<void> {
    await this.gate.run(() =>
      this.gate.transaction(() => this.initializeBaselineTx(baseline)),
    );
  }

  private async initializeBaselineTx(
    baseline: IAggregateNodeBaseline,
  ): Promise<void> {
    await this.db.run(sql`PRAGMA defer_foreign_keys = ON`);
    const metadata = await readAggregateNodeMetadata(this.db, this.nodeTables);
    if (hasAggregateNodeCheckpoint(metadata)) {
      throw makeZerospinError({
        code: 'node-baseline-already-initialized',
      });
    }
    const indexes = await readAggregateNodeIndexes(this.db, this.nodeTables);
    if (
      indexes.nodeIndex !== 0 ||
      indexes.pushIndex !== 0 ||
      metadata.admittedThroughPushIndex !== 0 ||
      baseline.resolvedThrough !== 0 ||
      !Number.isSafeInteger(baseline.aggregateIndex) ||
      baseline.aggregateIndex < 0 ||
      !/^[a-f0-9]{64}$/u.test(baseline.dispositionChainHash)
    ) {
      throw makeZerospinError({ code: 'node-baseline-checkpoint-invalid' });
    }
    for (const resource of baseline.resources) {
      const table = this.tables[resource.modelName];
      const model = this.sessionDefinition.models[resource.modelName];
      if (
        table === undefined ||
        model === undefined ||
        resource.version !== model.version
      ) {
        throw makeZerospinError({ code: 'node-resource-model-invalid' });
      }
      await this.db
        .insert(table)
        .values(makeEncodedRowFromResource(resource, model));
    }
    await this.retainReadBaseline(metadata.nodeId, baseline);
    await this.db.update(this.nodeTables.metadata).set({
      aggregateIndex: baseline.aggregateIndex,
      dispositionChainHash: baseline.dispositionChainHash,
    });
  }

  snapshot(
    input: {
      pendingCommands?: readonly IAggregateNodeCommand[];
      authoritative?: boolean;
    } = {},
  ): Promise<IAggregateNodeSnapshot> {
    return this.gate.run(() =>
      this.gate.transaction(() =>
        this.readSnapshot(input.pendingCommands, input.authoritative),
      ),
    );
  }

  private async readSnapshot(
    pendingCommands: readonly IAggregateNodeCommand[] = [],
    authoritative = false,
  ): Promise<IAggregateNodeSnapshot> {
    try {
      if (
        new Set(pendingCommands.map(sessionSubmissionKey)).size !==
        pendingCommands.length
      ) {
        throw makeZerospinError('node-snapshot-pending-ids-invalid');
      }
      const metadata = await readAggregateNodeMetadata(
        this.db,
        this.nodeTables,
      );
      const indexes = await readAggregateNodeIndexes(this.db, this.nodeTables);
      const outcomeIndex = await readAggregateNodeOutcomeIndex(
        this.db,
        this.nodeTables,
      );
      const resources = await this.readAuthoritativeResources();
      const commandCoverage = await this.readCommandCoverage(
        pendingCommands,
        metadata,
        indexes.nodeIndex,
      );
      // Synchronization reads checkpoints before missing finals can be replayed safely.
      const viewResources = authoritative
        ? resources
        : await this.readOptimisticResources(
            resources,
            metadata,
            indexes.nodeIndex,
          );
      return {
        identity: this.definition.identity,
        state: this.status(),
        metadata,
        nodeIndex: indexes.nodeIndex,
        pushIndex: indexes.pushIndex,
        outcomeIndex,
        resources: viewResources,
        commandCoverage,
      };
    } catch (error) {
      this.deferConnectedRecovery(error);
      throw error;
    }
  }

  private async readAuthoritativeResources(): Promise<IEncodedResourceShape[]> {
    const resources: IEncodedResourceShape[] = [];
    await Promise.all(
      Object.values(
        mapValues(this.tables, async (table, modelName) => {
          const model = this.sessionDefinition.models[modelName];
          if (model === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          for (const resource of await this.db.select().from(table)) {
            if (typeof resource.id !== 'string') {
              throw makeZerospinError({ code: 'node-resource-invalid' });
            }
            resources.push(makeResourceFromEncodedRow(resource, model));
          }
        }),
      ),
    );
    return resources;
  }

  private async readCommandCoverage(
    pendingCommands: readonly IAggregateNodeCommand[],
    metadata: typeof this.nodeTables.metadata.$inferSelect,
    capturedNodeIndex: number,
  ): Promise<IAggregateNodeSnapshot['commandCoverage']> {
    const commandCoverage: IAggregateNodeSnapshot['commandCoverage'][number][] =
      [];
    for (const command of pendingCommands) {
      const rows = await this.db
        .select()
        .from(this.nodeTables.commands)
        .where(
          and(
            eq(this.nodeTables.commands.sessionId, command.sessionId),
            eq(this.nodeTables.commands.sessionIndex, command.sessionIndex),
          ),
        );
      const original = rows.find(row => row.pushIndex !== null);
      const [final] =
        original === undefined
          ? []
          : await this.db
              .select()
              .from(this.nodeTables.commands)
              .where(
                and(
                  eq(
                    this.nodeTables.commands.id,
                    makeNodeCommandId(metadata.nodeId, original.pushIndex!),
                  ),
                  isNotNull(this.nodeTables.commands.aggregateIndex),
                ),
              )
              .limit(1);
      if (original === undefined) {
        if (final !== undefined || command.nodeId !== null) {
          throw makeZerospinError(
            'session-snapshot-acknowledged-command-missing',
          );
        }
        commandCoverage.push({
          sessionId: command.sessionId,
          sessionIndex: command.sessionIndex,
          pushIndex: null,
          commandName: command.commandName,
          nodeId: null,
          nodeIndex: null,
          resolution: null,
        });
        continue;
      }
      const retained = readAggregateNodeCommand(
        original,
        metadata.nodeId,
        this.definition,
      );
      const { nodeId, nodeIndex, pushIndex } = retained;
      assertSameNodeCommand(retained, command);
      if (nodeIndex > capturedNodeIndex) {
        throw makeZerospinError('session-staged-coordinate-conflict');
      }
      const exposed =
        final === undefined
          ? null
          : readAggregateFinalCommand(final, metadata.nodeId);
      if (
        exposed !== null &&
        (exposed.nodeIndex > capturedNodeIndex ||
          metadata.aggregateIndex === null ||
          exposed.aggregateIndex > metadata.aggregateIndex)
      ) {
        throw makeZerospinError('session-snapshot-receipt-invalid');
      }
      commandCoverage.push({
        sessionId: command.sessionId,
        sessionIndex: command.sessionIndex,
        pushIndex,
        commandName: command.commandName,
        nodeId,
        nodeIndex,
        resolution:
          exposed === null
            ? null
            : {
                id: exposed.id,
                commandName: exposed.commandName,
                aggregateIndex: exposed.aggregateIndex,
                failure: exposed.failure,
              },
      });
    }
    return commandCoverage;
  }

  private async readOptimisticResources(
    resources: readonly IEncodedResourceShape[],
    metadata: typeof this.nodeTables.metadata.$inferSelect,
    nodeIndex: number,
  ): Promise<readonly IEncodedResourceShape[]> {
    let viewResources: readonly IEncodedResourceShape[] = resources;
    const unresolved = await this.db
      .select()
      .from(this.nodeTables.commands)
      .where(
        and(
          isNotNull(this.nodeTables.commands.pushIndex),
          !this.connected
            ? undefined
            : gt(
                this.nodeTables.commands.pushIndex,
                readBaselineResolvedThrough,
              ),
          not(
            hasNodeCommandFinal({
              nodeId: metadata.nodeId,
              journal: this.nodeTables.commands,
              finalIndex: this.nodeTables.commands.aggregateIndex,
            }),
          ),
        ),
      )
      .orderBy(this.nodeTables.commands.nodeIndex);
    if (hasAggregateNodeCheckpoint(metadata)) {
      const key = [
        metadata.nodeId,
        nodeIndex,
        metadata.aggregateIndex,
        metadata.dispositionChainHash,
      ].join(':');
      if (this.projected?.key !== key) {
        const commands = unresolved.map(row =>
          readAggregateNodeCommand(row, metadata.nodeId, this.definition),
        );
        try {
          this.projected = {
            key,
            resources: this.optimisticView.project(resources, commands),
          };
          this.projectionFailure = null;
        } catch (error) {
          this.projected = undefined;
          this.projectionFailure = error;
          const failure = makeZerospinError({
            code: 'node-optimistic-view-failed',
            cause: prettyUnknownFailure(error),
          });
          this.deferConnectedRecovery(failure);
          throw failure;
        }
      }
      viewResources = this.projected.resources;
    }
    return viewResources;
  }

  /** Snapshot capture and registration share one boundary; delivery runs outside SQLite. */
  subscribe(
    input: {
      pendingCommands?: readonly IAggregateNodeCommand[];
    },
    sink: IAggregateNodeSink,
    requests: () => readonly IAggregateNodeCommand[] = () =>
      input.pendingCommands ?? [],
  ): Promise<() => void> {
    return this.subscriptions.subscribe(sink, () =>
      this.gate.run(() =>
        this.gate.transaction(() => this.readSnapshot(requests())),
      ),
    );
  }

  accept(
    command: IAggregateNodeCommand,
    expectedNodeId?: string,
    assertCurrent: () => void = () => {},
  ): Promise<INodeRetention> {
    return this.retainOriginal(command, expectedNodeId, assertCurrent);
  }

  /** A released page journal may still carry its predecessor requirement after SQLite adoption. */
  acceptJournalOriginal(
    entry: IAggregateJournalOriginal,
    expectedNodeId: string,
    assertCurrent: () => void,
  ) {
    const { dependsOn, ...command } = entry;
    return this.retainOriginal(
      command,
      expectedNodeId,
      assertCurrent,
      dependsOn === undefined
        ? undefined
        : () =>
            checkPublishedJournalOriginal(
              this.db,
              this.nodeTables,
              this.definition,
              expectedNodeId,
              entry,
            ),
    );
  }

  private async retainOriginal(
    command: IAggregateNodeCommand,
    expectedNodeId: string | undefined,
    assertCurrent: () => void,
    checkPredecessor?: () => Promise<void>,
  ): Promise<INodeRetention> {
    if (this.resetInProgress) throw makeZerospinError('node-staging-blocked');
    const generation = this.mutationGeneration;
    const retention = await this.gate.run(() =>
      this.gate.transaction(async () => {
        assertCurrent();
        if (this.resetInProgress || generation !== this.mutationGeneration) {
          throw makeZerospinError('outbox-source-replaced');
        }
        await checkPredecessor?.();
        const retained = await acceptAggregateOriginalTx({
          nodeTables: this.nodeTables,
          db: this.db,
          definition: this.definition,
          command,
          blockedWork: () => this.status().blockedWork,
          ...(expectedNodeId === undefined ? {} : { expectedNodeId }),
          ...(this.standalone === undefined
            ? {}
            : { standalone: this.standalone }),
        });
        return retained;
      }),
    );
    this.subscriptions.publish();
    return retention;
  }

  history(input: {
    afterNodeIndex: number;
    limit: number;
  }): Promise<readonly IAggregateNodeCommandRow[]> {
    this.gate.assertOpen();
    if (
      !Number.isSafeInteger(input.afterNodeIndex) ||
      input.afterNodeIndex < 0 ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      return Promise.reject(
        makeZerospinError({ code: 'node-history-page-invalid' }),
      );
    }
    return this.gate.run(() =>
      this.db
        .select()
        .from(this.nodeTables.commands)
        .where(gt(this.nodeTables.commands.nodeIndex, input.afterNodeIndex))
        .orderBy(this.nodeTables.commands.nodeIndex)
        .limit(input.limit),
    );
  }

  async setPushPaused(
    pushPaused: boolean,
    expectedNodeId?: string,
  ): Promise<void> {
    if (this.resetInProgress) throw makeZerospinError('node-staging-blocked');
    const generation = this.mutationGeneration;
    await this.gate.run(() =>
      this.gate.transaction(async () => {
        if (this.resetInProgress || generation !== this.mutationGeneration) {
          throw makeZerospinError('outbox-source-replaced');
        }
        const metadata = await readAggregateNodeMetadata(
          this.db,
          this.nodeTables,
        );
        if (
          expectedNodeId !== undefined &&
          metadata.nodeId !== expectedNodeId
        ) {
          throw makeZerospinError('standalone-capability-stale');
        }
        await this.db.update(this.nodeTables.metadata).set({ pushPaused });
      }),
    );
    this.subscriptions.publish();
  }

  nextPush(
    manual = false,
  ): Promise<Extract<IAggregateNodeCommand, { nodeId: string }> | null> {
    return this.gate.run(async () => {
      const metadata = await readAggregateNodeMetadata(
        this.db,
        this.nodeTables,
      );
      if (this.status().blockedWork) {
        throw makeZerospinError({ code: 'node-push-blocked' });
      }
      if (!manual && metadata.pushPaused) return null;
      const [row] = await this.db
        .select()
        .from(this.nodeTables.commands)
        .where(
          gt(
            this.nodeTables.commands.pushIndex,
            metadata.admittedThroughPushIndex,
          ),
        )
        .orderBy(this.nodeTables.commands.pushIndex)
        .limit(1);
      if (row === undefined) return null;
      return readAggregateNodeCommand(row, metadata.nodeId, this.definition);
    });
  }

  async reconcileAdmission(
    expectedPushIndex: number,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    const reconciled = await this.gate.run(() =>
      this.gate.transaction(async () => {
        if (!isCurrent()) return false;
        const metadata = await readAggregateNodeMetadata(
          this.db,
          this.nodeTables,
        );
        const indexes = await readAggregateNodeIndexes(
          this.db,
          this.nodeTables,
        );
        if (
          !Number.isSafeInteger(expectedPushIndex) ||
          expectedPushIndex < 1 ||
          expectedPushIndex - 1 < metadata.admittedThroughPushIndex ||
          expectedPushIndex - 1 > indexes.pushIndex
        ) {
          throw makeZerospinError({ code: 'node-admission-history-conflict' });
        }
        const [completed] = await this.db
          .select({ id: this.nodeTables.commands.id })
          .from(this.nodeTables.commands)
          .where(
            and(
              sql`${this.nodeTables.commands.pushIndex} >= ${expectedPushIndex}`,
              hasNodeCommandFinal({
                nodeId: metadata.nodeId,
                journal: this.nodeTables.commands,
                finalIndex: this.nodeTables.commands.aggregateIndex,
              }),
            ),
          )
          .limit(1);
        if (!isCurrent()) return false;
        if (completed !== undefined) {
          throw makeZerospinError({ code: 'node-admission-history-conflict' });
        }
        await this.db
          .update(this.nodeTables.metadata)
          .set({ admittedThroughPushIndex: expectedPushIndex - 1 });
        return true;
      }),
    );
    if (reconciled) this.subscriptions.publish();
  }

  async admitted(
    input: {
      id: `cmd_${string}`;
      pushIndex: number;
    },
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    this.gate.assertOpen();
    if (!Number.isSafeInteger(input.pushIndex) || input.pushIndex < 1) {
      throw makeZerospinError({ code: 'node-admission-result-invalid' });
    }
    const advanced = await this.gate.run(() =>
      this.gate.transaction(async () => {
        if (!isCurrent()) return false;
        const metadata = await readAggregateNodeMetadata(
          this.db,
          this.nodeTables,
        );
        const [row] = await this.db
          .select()
          .from(this.nodeTables.commands)
          .where(eq(this.nodeTables.commands.pushIndex, input.pushIndex));
        if (!isCurrent()) return false;
        if (
          row === undefined ||
          makeNodeCommandId(metadata.nodeId, input.pushIndex) !== input.id
        ) {
          throw makeZerospinError({ code: 'node-admission-conflict' });
        }
        if (input.pushIndex <= metadata.admittedThroughPushIndex) return false;
        await this.db
          .update(this.nodeTables.metadata)
          .set({ admittedThroughPushIndex: input.pushIndex });
        return true;
      }),
    );
    if (advanced) this.subscriptions.publish();
  }

  /** Retention, resource changes, local settlement, and all cursors commit together. */
  async receiveCommand(command: IAggregateExposedCommand): Promise<void> {
    this.gate.assertOpen();
    if (this.checkpointConflict !== null) {
      throw makeZerospinError({ code: 'node-synchronization-blocked' });
    }
    try {
      const appended = await this.gate.run(() =>
        this.gate.transaction(async () => {
          return retainAggregateFinalTx({
            nodeTables: this.nodeTables,
            db: this.db,
            models: this.sessionDefinition.models,
            tables: this.tables,
            command,
          });
        }),
      );
      if (appended) this.subscriptions.publish();
    } catch (error) {
      if (this.gate.closed) throw error;
      this.checkpointConflict = error;
      this.connectionState('blocked', error);
      throw error;
    }
  }

  /** Drain accepted work under the same gate as snapshots, acceptance, and reset. */
  async executeNext(
    execute: (
      command: Extract<IAggregateNodeCommand, { nodeId: string }>,
      checkpoint: IAggregateNodeSnapshot['metadata'] & {
        aggregateIndex: number;
        dispositionChainHash: string;
      },
    ) => Promise<IAggregateExposedCommand>,
    input: { manual?: boolean; expectedNodeId?: string } = {},
  ): Promise<boolean> {
    const appended = await this.gate.run(async () => {
      const retained = await this.gate.transaction(async () => {
        const metadata = await readAggregateNodeMetadata(
          this.db,
          this.nodeTables,
        );
        if (
          input.expectedNodeId !== undefined &&
          metadata.nodeId !== input.expectedNodeId
        ) {
          throw makeZerospinError('standalone-capability-stale');
        }
        if (!hasAggregateNodeCheckpoint(metadata)) {
          throw makeZerospinError('node-storage-incomplete');
        }
        if (!input.manual && metadata.pushPaused) return false;
        const [row] = await this.db
          .select()
          .from(this.nodeTables.commands)
          .where(
            and(
              isNotNull(this.nodeTables.commands.pushIndex),
              not(
                hasNodeCommandFinal({
                  nodeId: metadata.nodeId,
                  journal: this.nodeTables.commands,
                  finalIndex: this.nodeTables.commands.aggregateIndex,
                }),
              ),
            ),
          )
          .orderBy(this.nodeTables.commands.pushIndex)
          .limit(1);
        if (row === undefined) return false;
        const command = await execute(
          readAggregateNodeCommand(row, metadata.nodeId, this.definition),
          metadata,
        );
        return retainAggregateFinalTx({
          nodeTables: this.nodeTables,
          db: this.db,
          models: this.sessionDefinition.models,
          tables: this.tables,
          command,
          applyDelta: false,
        });
      });
      if (retained) this.persistenceFailure = null;
      return retained;
    });
    if (appended) {
      this.subscriptions.publish();
    }
    return appended;
  }

  /** Connected reset acknowledgements run outside the Node SQL gate. */
  async prepareReset(
    signal?: AbortSignal,
    preservePending = false,
  ): Promise<(publishReplacement?: boolean) => Promise<void>> {
    this.gate.assertOpen();
    if (!this.resetInProgress) this.mutationGeneration += 1;
    this.resetInProgress = true;
    let release: () => void;
    try {
      release = await this.subscriptions.prepareReset(signal, preservePending);
    } catch (error) {
      this.resetInProgress = false;
      throw error;
    }
    let finished = false;
    return async (publishReplacement = false) => {
      if (finished) return;
      finished = true;
      try {
        if (publishReplacement) {
          if (signal?.aborted) throw makeZerospinError('node-tab-detached');
          await this.snapshot();
          if (signal?.aborted) throw makeZerospinError('node-tab-detached');
          this.subscriptions.publish();
        }
      } finally {
        this.resetInProgress = false;
        release();
      }
    };
  }

  /** Prove the retained standalone partition without traversing a damaged checkpoint. */
  async assertStandaloneRecoveryIdentity(): Promise<void> {
    await this.gate.run(async () => {
      this.assertStandaloneIdentity(
        await this.db.select().from(this.nodeTables.metadata),
      );
    });
  }

  /** Audit retained originals and finals during attachment, independently of browser interests. */
  async assertStandaloneRetainedCommands(): Promise<void> {
    await this.gate.run(() =>
      this.gate.transaction(async () => {
        const metadata = await readAggregateNodeMetadata(
          this.db,
          this.nodeTables,
        );
        const rows = await this.db.select().from(this.nodeTables.commands);
        for (const row of rows) {
          if (row.pushIndex !== null) {
            readAggregateNodeCommand(row, metadata.nodeId, this.definition);
          } else {
            readAggregateFinalCommand(row, metadata.nodeId);
          }
        }
      }),
    );
  }

  private assertStandaloneIdentity(
    rows: readonly (typeof this.nodeTables.metadata.$inferSelect)[],
  ) {
    if (this.standalone === undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    for (const retained of rows) {
      if (
        retained.aggregateId !== this.definition.identity.aggregateId ||
        retained.sessionKey !== this.standalone.storageKey
      ) {
        throw makeZerospinError('standalone-storage-identity-mismatch');
      }
    }
  }

  /** Standalone reset retains its existing capability restriction and pause setting. */
  async reset(baseline: IAggregateNodeBaseline): Promise<void> {
    this.gate.assertOpen();
    if (this.standalone === undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    await this.replaceBaseline(baseline, false);
  }

  /** Connected owners claim local failures before delivery can publish a terminal state. */
  setConnectedRecoveryHandler(handler?: (failure: unknown) => boolean): void {
    this.connectedRecoveryHandler = handler;
  }

  /** Release a claimed failure hold when recovery cannot reach a replacement. */
  failConnectedRecovery(failure: unknown): void {
    this.resetInProgress = false;
    this.subscriptions.resume();
    this.connectionState('blocked', failure);
  }

  private deferConnectedRecovery(failure: unknown): boolean {
    if (this.connectedRecoveryHandler?.(failure) !== true) return false;
    if (!this.resetInProgress) this.mutationGeneration += 1;
    this.resetInProgress = true;
    this.subscriptions.suspend();
    return true;
  }

  /** Read producer identity without traversing damaged resources or derived projections. */
  async readConnectedRecoveryIdentity(): Promise<string> {
    if (this.standalone !== undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    return this.gate.run(
      async () => (await this.readConnectedRecoveryMetadata()).nodeId,
    );
  }

  private async readConnectedRecoveryMetadata() {
    const [version] = await this.db.values<[number]>(sql`PRAGMA user_version`);
    if (!this.connected) {
      if (version?.[0] !== 22) {
        throw makeZerospinError('node-storage-reset-required');
      }
    } else {
      await aggregateNodeDatabase.assertCurrentSchema(this.db);
    }
    const rows = await this.db.select().from(this.nodeTables.metadata).limit(2);
    if (rows.length !== 1) throw makeZerospinError('node-metadata-ambiguous');
    const metadata = rows[0]!;
    if (typeof metadata.pushPaused !== 'boolean') {
      throw makeZerospinError('node-metadata-invalid');
    }
    if (
      metadata.aggregateId !== this.definition.identity.aggregateId ||
      metadata.sessionKey !== (await sessionKey(this.definition.identity))
    ) {
      throw makeZerospinError('node-storage-identity-mismatch');
    }
    Schema.decodeUnknownSync(makeAbbreviationIdSchema(coreAbbreviations.node))(
      metadata.nodeId,
    );
    return metadata;
  }

  /** Replace derived state while retaining every original producer allocation for authenticated replay. */
  async repairConnectedBaseline(
    baseline: IAggregateNodeBaseline,
    assertCurrent: () => void = () => {},
  ): Promise<void> {
    if (this.standalone !== undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    await this.gate.run(async () => {
      assertCurrent();
      if (
        !Number.isSafeInteger(baseline.resolvedThrough) ||
        baseline.resolvedThrough < 0 ||
        !Number.isSafeInteger(baseline.aggregateIndex) ||
        baseline.aggregateIndex < 0 ||
        baseline.resolvedThrough > baseline.aggregateIndex ||
        !/^[a-f0-9]{64}$/u.test(baseline.dispositionChainHash)
      ) {
        throw makeZerospinError('node-baseline-checkpoint-invalid');
      }
      const resources = baseline.resources.map(resource => {
        const table = this.tables[resource.modelName];
        const model = this.sessionDefinition.models[resource.modelName];
        if (
          table === undefined ||
          model === undefined ||
          resource.version !== model.version
        ) {
          throw makeZerospinError('node-resource-model-invalid');
        }
        return { table, value: makeEncodedRowFromResource(resource, model) };
      });
      await this.gate.transaction(async () => {
        this.gate.assertOpen();
        assertCurrent();
        const metadata = await this.readConnectedRecoveryMetadata();
        const originals = await this.db
          .select()
          .from(this.nodeTables.commands)
          .where(isNotNull(this.nodeTables.commands.pushIndex))
          .orderBy(this.nodeTables.commands.pushIndex);
        let pushIndex = 0;
        let nodeIndex = 0;
        for (const row of originals) {
          const command = readAggregateNodeCommand(
            row,
            metadata.nodeId,
            this.definition,
          );
          if (
            command.pushIndex !== ++pushIndex ||
            command.nodeIndex <= nodeIndex
          ) {
            throw makeZerospinError('node-command-input-missing');
          }
          nodeIndex = command.nodeIndex;
          const contract =
            this.sessionDefinition.contracts[command.commandName];
          if (contract === undefined) {
            throw makeZerospinError('node-command-contract-mismatch');
          }
          Schema.decodeUnknownSync(
            Schema.fromJsonString(
              makeShapeCodecs(contract.payload).portableCompleteCodec,
            ),
            { onExcessProperty: 'error' },
          )(command.payload);
          if (
            (await sessionKey({
              ...this.definition.identity,
              claims: command.claims,
            })) !== metadata.sessionKey
          ) {
            throw makeZerospinError('node-command-identity-mismatch');
          }
        }
        if (
          !Number.isSafeInteger(metadata.admittedThroughPushIndex) ||
          metadata.admittedThroughPushIndex < 0 ||
          metadata.admittedThroughPushIndex > pushIndex ||
          baseline.resolvedThrough > pushIndex
        ) {
          throw makeZerospinError('node-command-input-missing');
        }
        await this.db.run(sql`PRAGMA defer_foreign_keys = ON`);
        // Finals are derived evidence; replay authenticates them again against the replacement checkpoint.
        await this.db
          .delete(this.nodeTables.commands)
          .where(isNull(this.nodeTables.commands.pushIndex));
        for (const table of Object.values(this.tables)) {
          await this.db.delete(table);
        }
        for (const { table, value } of resources) {
          await this.db.insert(table).values(value);
        }
        await this.retainReadBaseline(metadata.nodeId, baseline);
        await this.db.update(this.nodeTables.metadata).set({
          admittedThroughPushIndex: 0,
          aggregateIndex: baseline.aggregateIndex,
          dispositionChainHash: baseline.dispositionChainHash,
        });
        assertCurrent();
      });
      this.clearConnectedRecoveryState();
    });
  }

  /** The connected worker owns authenticated replacement and its acknowledged delivery pause. */
  async resetConnectedBaseline(
    baseline: IAggregateNodeBaseline,
    assertCurrent: () => void = () => {},
  ): Promise<void> {
    this.gate.assertOpen();
    if (this.standalone !== undefined) {
      throw makeZerospinError('standalone-capability-stale');
    }
    await this.replaceBaseline(baseline, true, assertCurrent);
  }

  private async replaceBaseline(
    baseline: IAggregateNodeBaseline,
    connected: boolean,
    assertCurrent: () => void = () => {},
  ): Promise<void> {
    await this.gate.run(async () => {
      assertCurrent();
      if (
        baseline.resolvedThrough !== 0 ||
        !Number.isSafeInteger(baseline.aggregateIndex) ||
        baseline.aggregateIndex < 0 ||
        !/^[a-f0-9]{64}$/u.test(baseline.dispositionChainHash)
      ) {
        throw makeZerospinError('node-baseline-checkpoint-invalid');
      }
      const resources = baseline.resources.map(resource => {
        const table = this.tables[resource.modelName];
        const model = this.sessionDefinition.models[resource.modelName];
        if (
          table === undefined ||
          model === undefined ||
          resource.version !== model.version
        ) {
          throw makeZerospinError('node-resource-model-invalid');
        }
        return {
          table,
          value: makeEncodedRowFromResource(resource, model),
        };
      });
      const nodeId = await Effect.runPromise(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.node,
        }).pipe(Effect.provide(NanoIdFactory)),
      );
      await this.gate.transaction(async () => {
        if (connected) this.gate.assertOpen();
        await this.db.run(sql`PRAGMA defer_foreign_keys = ON`);
        assertCurrent();
        const standaloneRows = connected
          ? undefined
          : await this.db.select().from(this.nodeTables.metadata);
        if (connected) {
          await readAggregateNodeMetadata(this.db, this.nodeTables);
        } else {
          this.assertStandaloneIdentity(standaloneRows ?? []);
        }
        await this.db.delete(this.nodeTables.commands);
        for (const table of Object.values(this.tables)) {
          await this.db.delete(table);
        }
        for (const { table, value } of resources) {
          await this.db.insert(table).values(value);
        }
        const checkpoint = {
          nodeId,
          admittedThroughPushIndex: 0,
          aggregateIndex: baseline.aggregateIndex,
          dispositionChainHash: baseline.dispositionChainHash,
        };
        if (connected) {
          await this.retainReadBaseline(nodeId, baseline);
          await this.db.update(this.nodeTables.metadata).set({
            ...checkpoint,
            pushPaused: false,
          });
        } else {
          if (this.standalone === undefined) {
            throw makeZerospinError('standalone-capability-stale');
          }
          await this.db.delete(this.nodeTables.metadata);
          await this.db.insert(this.nodeTables.metadata).values({
            ...checkpoint,
            aggregateId: this.definition.identity.aggregateId,
            sessionKey: this.standalone.storageKey,
            pushPaused: standaloneRows?.[0]?.pushPaused === true,
          });
        }
        assertCurrent();
      });
      this.persistenceFailure = null;
      this.projectionFailure = null;
      this.projected = undefined;
      this.checkpointConflict = null;
      if (connected) {
        this.synchronization = 'offline';
        this.connectionFailure = null;
        this.admissionRejection = null;
      }
      if (!connected) {
        this.subscriptions.publish();
      }
    });
  }

  admissionRejected(rejection: {
    commandId: string;
    commandName: string;
    failure: typeof PublicFailureSchema.Type;
  }): void {
    this.gate.assertOpen();
    this.admissionRejection = rejection;
    this.connectionState('blocked', makeZerospinError(rejection.failure));
  }

  /** Explicit transport retry cannot clear storage, projection, identity or admission failures. */
  assertConnectionRetryable(): void {
    this.gate.assertOpen();
    const state = this.status();
    if (!state.blockedWork) return;
    if (
      state.localAvailability === 'available' &&
      this.checkpointConflict === null &&
      !this.authenticationRejected &&
      !this.suspended &&
      this.admissionRejection === null &&
      (this.connectionFailure?.code === 'node-subscription-closed' ||
        this.connectionFailure?.code === 'node-subscription-timeout')
    ) {
      return;
    }
    throw makeZerospinError(
      state.failure ?? {
        code: this.suspended
          ? 'node-signed-out'
          : this.authenticationRejected
            ? 'node-authentication-rejected'
            : 'node-synchronization-blocked',
      },
    );
  }

  /** Recheck after the prior socket attempt drains; retained SQLite facts stay untouched. */
  retryConnection(): void {
    this.assertConnectionRetryable();
    if (this.synchronization === 'blocked') this.connectionState('offline');
  }

  connectionState(state: string, failure?: unknown): void {
    if (this.gate.closed) return;
    if (state === 'online' && this.checkpointConflict === null) {
      this.admissionRejection = null;
    }
    if (state === 'authenticating') {
      this.authenticationState = 'authenticating';
    } else if (
      state === 'offline' &&
      this.authenticationState === 'authenticating'
    ) {
      this.authenticationState = 'unavailable';
    }
    this.synchronization = this.checkpointConflict === null ? state : 'blocked';
    this.connectionFailure =
      this.checkpointConflict !== null
        ? encodeNodeFailure(
            'node-synchronization-failed',
            this.checkpointConflict,
          )
        : failure === undefined
          ? null
          : encodeNodeFailure('node-synchronization-failed', failure);
    this.subscriptions.publish();
  }

  status() {
    return {
      localAvailability:
        this.persistenceFailure === null && this.projectionFailure === null
          ? 'available'
          : 'failed',
      authentication: this.suspended
        ? 'signed-out'
        : this.authenticationRejected
          ? 'rejected'
          : this.authenticationState,
      synchronization: this.synchronization,
      blockedWork:
        this.authenticationRejected ||
        this.suspended ||
        this.persistenceFailure !== null ||
        this.projectionFailure !== null ||
        this.synchronization === 'blocked',
      admissionRejection: this.admissionRejection,
      failure:
        this.persistenceFailure === null && this.projectionFailure === null
          ? this.connectionFailure
          : encodeNodeFailure(
              'node-persistence-failed',
              this.persistenceFailure ?? this.projectionFailure,
            ),
    };
  }

  async authenticated(
    identity: IAggregateNodeDefinition['identity'],
    current: () => boolean = () => true,
  ): Promise<void> {
    this.gate.assertOpen();
    if (
      (await sessionKey(identity)) !==
      (this.standalone?.storageKey ??
        (await sessionKey(this.definition.identity)))
    ) {
      throw makeZerospinError({
        code: 'node-authentication-identity-mismatch',
      });
    }
    await this.gate.run(async () => {
      if (!current()) {
        throw makeZerospinError({ code: 'node-authentication-cancelled' });
      }
      this.authenticationRejected = false;
      this.authenticationState = 'verified';
      this.suspended = false;
    });
    this.subscriptions.publish();
  }

  async rejectAuthentication(): Promise<void> {
    await this.gate.run(async () => {
      this.authenticationRejected = true;
    });
    this.subscriptions.publish();
  }

  async clearAuthentication(): Promise<void> {
    await this.gate.run(async () => {
      this.suspended = true;
      this.admissionRejection = null;
    });
    this.subscriptions.publish();
  }
}
