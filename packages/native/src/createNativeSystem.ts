import { getOperationLeaves } from '@zerospin/core/contracts/operationSchema';
import {
  makeDbConfig,
  makeResourceDbConfig,
} from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { validateDbSchema } from '@zerospin/core/drizzle/provisionDb/validateDbSchema';
import type {
  IDb,
  IDbConfig,
  ISqliteClient,
} from '@zerospin/core/drizzle/types';
import { makeResourceFromEncodedRow } from '@zerospin/core/Node/resourceEnvelope';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import type { ISystem } from '@zerospin/core/system/types';
import { sha256 } from '@zerospin/core/utils/sha256';
import {
  makeAbbreviationIdSchema,
  makeTable,
  primitives,
} from '@zerospin/shapes';
import {
  admitDirectSystemAggregateCommandTx,
  aggregateChainDbConfig,
  aggregateVersionArchiveDbConfig,
  aggregateVersionRepoDbConfig,
  appendEvaluatedCommandsTx,
  compactAggregateHistory,
  decodeAggregateEvaluatedCommandRow,
  decodeAggregateHistoryCommand,
  materializeCommandTx,
  readAdmittedAggregateCommand,
  recordOriginalCommandOutcomeTx,
} from '@zerospin/system-worker/nativeAggregateSystem';
import { asc, eq, sql } from 'drizzle-orm';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { nativeSqliteExists, openNativeSqlite } from './openNativeSqlite.ts';

const { commandProgress, replaySubscribers } = aggregateChainDbConfig.schema;

const systemDbConfig = makeDbConfig({
  tables: {
    systemMetadata: makeTable({
      name: 'systemMetadata',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        systemId: primitives.text(),
        systemName: primitives.text(),
        systemSpecHash: primitives.text(),
        aggregateName: primitives.text(),
        aggregateVersion: primitives.integer(),
      },
    }),
    aggregates: makeTable({
      name: 'aggregates',
      shape: {
        aggregateId: primitives.text({ primaryKey: true }),
        ready: primitives.integer(),
      },
    }),
  },
});

type IOpenedDb<CONFIG extends IDbConfig> = {
  client: ISqliteClient;
  db: IDb<CONFIG>;
  empty: boolean;
};

type IAggregateRecoveryFailure = {
  aggregateId: string;
  commandId: string;
  aggregateIndex: number;
  message: string;
};

/** An admitted command blocked by an unavailable application service. */
class NativeAggregateServiceUnavailable extends Error {
  readonly failure: IAggregateRecoveryFailure;

  constructor(
    props: Omit<IAggregateRecoveryFailure, 'message'>,
    cause: unknown,
  ) {
    super(
      `Aggregate ${props.aggregateId} has a pending admitted command ${props.commandId}; its execution did not complete. The native host does not provide application services. ${String(cause)}`,
      { cause },
    );
    this.failure = { ...props, message: this.message };
  }
}

function isMissingService(cause: unknown): boolean {
  const seen = new Set<unknown>();
  let current = cause;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/^Service not found(?::|$)/u.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

function openDb<CONFIG extends IDbConfig>(
  name: string,
  config: CONFIG,
  readOnly = false,
): IOpenedDb<CONFIG> {
  const client = openNativeSqlite(name, { readOnly });
  try {
    const db = makeSqliteDrizzle(client, config);
    const tables = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    if (tables.length !== 0) {
      Effect.runSync(validateDbSchema(db, { definition: config.definition }));
    }
    return { client, db, empty: tables.length === 0 };
  } catch (error) {
    client.sqlite3.close(client.db);
    throw error;
  }
}

function closeDb(opened: IOpenedDb<IDbConfig>) {
  opened.client.sqlite3.close(opened.client.db);
}

/** Host one authored System with System-origin Aggregate commands. */
export function createNativeSystem(system: ISystem) {
  const systemSpec = makeSystemSpec({ system });
  const aggregateNames = Object.keys(system.aggregates);
  if (
    aggregateNames.length !== 1 ||
    Object.keys(system.services).length !== 0 ||
    Object.keys(system.aggregateAgents).length !== 0 ||
    Object.keys(system.serviceAgents).length !== 0
  ) {
    throw new Error(
      'Native System requires exactly one Aggregate and no Services or Agents',
    );
  }
  const aggregateName = aggregateNames[0]!;
  const registry = system.aggregates[aggregateName]!;
  const [release, extraRelease] = Object.values(registry.releases);
  if (
    release === undefined ||
    extraRelease !== undefined ||
    Object.keys(release.actors).length !== 0 ||
    Object.keys(release.external).length !== 0
  ) {
    throw new Error(
      'Native System requires one Aggregate release without Actors, Agents, or external contracts',
    );
  }
  const aggregateVersion = release.version;
  for (const contract of Object.values(release.system)) {
    if (
      contract.external !== undefined ||
      contract.claims !== undefined ||
      getOperationLeaves(contract.operations).some(
        operation => !('model' in operation),
      )
    ) {
      throw new Error(
        `System command ${contract.commandName} uses unsupported operations`,
      );
    }
  }
  const commands = Object.values(release.system).map(contract => ({
    name: contract.commandName,
    version: contract.version,
    payloadShape:
      systemSpec.aggregates[aggregateName]!.contractVersions[
        contract.commandName
      ]![contract.version]!.payloadShape,
  }));
  const inspection = {
    systemName: system.name,
    systemSpec,
    aggregateName,
    aggregateVersion,
    commands,
  };
  const resourcesConfig = makeResourceDbConfig({
    models: release.models,
    otherTables: aggregateVersionRepoDbConfig.tables,
  });
  let systemDb: IOpenedDb<typeof systemDbConfig> | undefined;
  const aggregates = new Map<
    string,
    {
      chain: IOpenedDb<typeof aggregateChainDbConfig>;
      repo: IOpenedDb<typeof resourcesConfig>;
      archive: IOpenedDb<typeof aggregateVersionArchiveDbConfig>;
    }
  >();
  let systemId: string | undefined;
  let disposed = false;

  // Authored callbacks carry dynamic service requirements; only System is provided.
  // Any other required service fails execution rather than receiving an invented one.
  const context = Context.makeUnsafe<unknown>(
    Context.make(System, system).mapUnsafe,
  );
  const run = Effect.runSyncWith(context);

  function closeAggregate(
    value: typeof aggregates extends Map<string, infer V> ? V : never,
  ) {
    closeDb(value.archive);
    closeDb(value.repo);
    closeDb(value.chain);
  }

  function preflightAggregate(aggregateId: string, ready: number) {
    if (ready !== 0 && ready !== 1) {
      throw new Error('Native System Aggregate registration is invalid');
    }
    const suffix = sha256(aggregateId);
    const check = <CONFIG extends IDbConfig>(name: string, config: CONFIG) => {
      if (!nativeSqliteExists(name)) {
        if (ready === 1) {
          throw new Error('Native System Aggregate storage is missing');
        }
        return;
      }
      const opened = openDb(name, config, true);
      try {
        if (ready === 1 && opened.empty) {
          throw new Error('Native System Aggregate storage is incomplete');
        }
      } finally {
        closeDb(opened);
      }
    };
    check(`chain_${suffix}`, aggregateChainDbConfig);
    check(`resource_${suffix}`, resourcesConfig);
    check(`history_${suffix}`, aggregateVersionArchiveDbConfig);
  }

  function validateRetainedIdentity(
    db: IDb<typeof systemDbConfig>,
    id: string,
  ) {
    const rows = db.select().from(systemDbConfig.schema.systemMetadata).all();
    const retained = rows[0];
    if (
      rows.length !== 1 ||
      retained === undefined ||
      retained.singleton !== 1 ||
      retained.systemId !== id ||
      retained.systemName !== system.name ||
      retained.systemSpecHash !== systemSpec.hash ||
      retained.aggregateName !== aggregateName ||
      retained.aggregateVersion !== aggregateVersion
    ) {
      throw new Error(
        'Native System storage identity or declarations are incompatible',
      );
    }
  }

  function openAggregate(aggregateId: string) {
    if (!aggregateId) throw new Error('Aggregate ID must not be empty');
    if (systemDb === undefined || systemId === undefined || disposed) {
      throw new Error('System is not initialized');
    }
    const existing = aggregates.get(aggregateId);
    if (existing !== undefined) return existing;
    const previous = systemDb.db
      .select()
      .from(systemDbConfig.schema.aggregates)
      .where(eq(systemDbConfig.schema.aggregates.aggregateId, aggregateId))
      .get();
    const suffix = sha256(aggregateId);
    const opened: IOpenedDb<IDbConfig>[] = [];
    try {
      const chain = openDb(`chain_${suffix}`, aggregateChainDbConfig);
      opened.push(chain);
      const repo = openDb(`resource_${suffix}`, resourcesConfig);
      opened.push(repo);
      const archive = openDb(
        `history_${suffix}`,
        aggregateVersionArchiveDbConfig,
      );
      opened.push(archive);
      if (
        previous?.ready === 1 &&
        (chain.empty || repo.empty || archive.empty)
      ) {
        throw new Error('Native System Aggregate storage is incomplete');
      }
      if (
        previous === undefined &&
        (!chain.empty || !repo.empty || !archive.empty)
      ) {
        throw new Error(
          'Native System Aggregate storage has no registered identity',
        );
      }
      if (previous === undefined) {
        systemDb.db
          .insert(systemDbConfig.schema.aggregates)
          .values({ aggregateId, ready: 0 })
          .run();
      }
      Effect.runSync(
        provisionDb({
          db: chain.db,
          definition: aggregateChainDbConfig.definition,
        }),
      );
      Effect.runSync(
        provisionDb({ db: repo.db, definition: resourcesConfig.definition }),
      );
      Effect.runSync(
        provisionDb({
          db: archive.db,
          definition: aggregateVersionArchiveDbConfig.definition,
        }),
      );
      chain.db.transaction(tx => {
        tx.insert(commandProgress)
          .values({
            singleton: 1,
            admittedThroughIndex: 0,
            finalizedThroughIndex: 0,
            compactedThroughIndex: 0,
          })
          .onConflictDoNothing()
          .run();
        tx.insert(replaySubscribers)
          .values({
            aggregateVersion,
            initializationThroughIndex: 0,
            acknowledgedAggregateIndex: 0,
          })
          .onConflictDoNothing()
          .run();
      });
      systemDb.db
        .update(systemDbConfig.schema.aggregates)
        .set({ ready: 1 })
        .where(eq(systemDbConfig.schema.aggregates.aggregateId, aggregateId))
        .run();
      const value = { chain, repo, archive };
      aggregates.set(aggregateId, value);
      return value;
    } catch (error) {
      for (const value of opened.reverse()) closeDb(value);
      throw error;
    }
  }

  function drain(aggregateId: string) {
    const value = openAggregate(aggregateId);
    const { chain, repo, archive } = value;
    const key = {
      systemId: systemId!,
      aggregateName,
      aggregateId,
      aggregateVersion,
    };
    const admittedRows = chain.db
      .select()
      .from(aggregateChainDbConfig.schema.commands)
      .orderBy(asc(aggregateChainDbConfig.schema.commands.aggregateIndex))
      .all();
    for (const stored of admittedRows) {
      const admittedCommand = readAdmittedAggregateCommand(stored, key);
      let pending = repo.db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
        .where(
          eq(
            aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox
              .aggregateIndex,
            admittedCommand.aggregateIndex,
          ),
        )
        .get();
      if (pending === undefined && admittedCommand.outcome === null) {
        try {
          run(
            materializeCommandTx(repo.db, {
              row: admittedCommand,
              aggregateRelease: release!,
              key,
              mode: 'original',
            }),
          );
        } catch (cause) {
          if (!isMissingService(cause)) throw cause;
          throw new NativeAggregateServiceUnavailable(
            {
              aggregateId,
              commandId: admittedCommand.id,
              aggregateIndex: admittedCommand.aggregateIndex,
            },
            cause,
          );
        }
        pending = repo.db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
          .where(
            eq(
              aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox
                .aggregateIndex,
              admittedCommand.aggregateIndex,
            ),
          )
          .get();
      }
      if (pending === undefined) {
        throw new Error('Native System evaluated command is missing');
      }
      const evaluatedCommand = Effect.runSync(
        aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
          .decodeRow(pending)
          .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
      );
      if (
        evaluatedCommand.operations.some(
          operation =>
            operation.operationName === 'command' ||
            operation.operationName === 'external',
        )
      ) {
        throw new Error(
          'Native System command emitted an unsupported operation',
        );
      }
      recordOriginalCommandOutcomeTx(
        chain.db,
        [evaluatedCommand.aggregateIndex],
        [evaluatedCommand],
        key,
      );
      appendEvaluatedCommandsTx(archive.db, {
        commands: [evaluatedCommand],
        firstAggregateIndex: 1,
      });
      chain.db.transaction(tx => {
        tx.update(replaySubscribers)
          .set({ acknowledgedAggregateIndex: evaluatedCommand.aggregateIndex })
          .where(eq(replaySubscribers.aggregateVersion, aggregateVersion))
          .run();
        compactAggregateHistory(tx, [aggregateVersion]);
      });
      repo.db
        .delete(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
        .where(
          eq(
            aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox
              .aggregateIndex,
            evaluatedCommand.aggregateIndex,
          ),
        )
        .run();
    }
    // A crash after publication but before delivery cleanup leaves an already-covered row.
    const pendingRows = repo.db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
      .all();
    for (const pending of pendingRows) {
      const evaluatedCommand = Effect.runSync(
        aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
          .decodeRow(pending)
          .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
      );
      const progress = chain.db
        .select()
        .from(commandProgress)
        .where(eq(commandProgress.singleton, 1))
        .get();
      if (
        progress === undefined ||
        progress.compactedThroughIndex < evaluatedCommand.aggregateIndex
      ) {
        throw new Error('Native System publication progress is inconsistent');
      }
      appendEvaluatedCommandsTx(archive.db, {
        commands: [evaluatedCommand],
        firstAggregateIndex: 1,
      });
      repo.db
        .delete(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
        .where(
          eq(
            aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox
              .aggregateIndex,
            evaluatedCommand.aggregateIndex,
          ),
        )
        .run();
    }
  }

  return {
    inspect: () => inspection,
    initialize(props: { systemId: string; requireExistingStorage: boolean }) {
      if (disposed || systemDb !== undefined) {
        throw new Error('System cannot be initialized twice');
      }
      Schema.decodeUnknownSync(makeAbbreviationIdSchema('sys'))(props.systemId);
      const exists = nativeSqliteExists('native_system');
      if (props.requireExistingStorage && !exists) {
        throw new Error('Native System storage is missing');
      }
      if (exists) {
        const retainedDb = openDb('native_system', systemDbConfig, true);
        try {
          if (retainedDb.empty) {
            throw new Error('Native System metadata is missing');
          }
          validateRetainedIdentity(retainedDb.db, props.systemId);
          for (const row of retainedDb.db
            .select()
            .from(systemDbConfig.schema.aggregates)
            .all()) {
            preflightAggregate(row.aggregateId, row.ready);
          }
        } finally {
          closeDb(retainedDb);
        }
      }
      const opened = openDb('native_system', systemDbConfig);
      try {
        if (props.requireExistingStorage && opened.empty) {
          throw new Error('Native System storage is missing');
        }
        if (!opened.empty) {
          validateRetainedIdentity(opened.db, props.systemId);
        }
        Effect.runSync(
          provisionDb({ db: opened.db, definition: systemDbConfig.definition }),
        );
        if (opened.empty) {
          opened.db
            .insert(systemDbConfig.schema.systemMetadata)
            .values({
              singleton: 1,
              systemId: props.systemId,
              systemName: system.name,
              systemSpecHash: systemSpec.hash,
              aggregateName,
              aggregateVersion,
            })
            .run();
        }
        systemDb = opened;
        systemId = props.systemId;
        const recoveryFailures: IAggregateRecoveryFailure[] = [];
        for (const row of opened.db
          .select()
          .from(systemDbConfig.schema.aggregates)
          .all()) {
          try {
            drain(row.aggregateId);
          } catch (error) {
            if (!(error instanceof NativeAggregateServiceUnavailable)) {
              throw error;
            }
            recoveryFailures.push(error.failure);
          }
        }
        return { ...inspection, recoveryFailures };
      } catch (error) {
        for (const value of aggregates.values()) closeAggregate(value);
        aggregates.clear();
        systemDb = undefined;
        systemId = undefined;
        closeDb(opened);
        throw error;
      }
    },
    execute(props: {
      aggregateId: string;
      commandName: string;
      payload: unknown;
    }) {
      const contract = release!.system[props.commandName];
      if (contract === undefined) {
        throw new Error('Command is not granted to the System');
      }
      const value = openAggregate(props.aggregateId);
      drain(props.aggregateId);
      const key = {
        systemId: systemId!,
        aggregateName,
        aggregateId: props.aggregateId,
      };
      const admittedCommand = run(
        admitDirectSystemAggregateCommandTx(value.chain.db, {
          key,
          systemSpec,
          command: {
            kind: 'system',
            aggregateName,
            aggregateId: props.aggregateId,
            aggregateVersion,
            commandName: props.commandName,
            contractVersion: contract.version,
            payload: JSON.stringify(props.payload),
          },
        }),
      );
      drain(props.aggregateId);
      const archived = value.archive.db
        .select()
        .from(aggregateVersionArchiveDbConfig.schema.commands)
        .where(
          eq(
            aggregateVersionArchiveDbConfig.schema.commands.aggregateIndex,
            admittedCommand.aggregateIndex,
          ),
        )
        .get();
      if (archived === undefined) {
        throw new Error('Native System outcome was not retained');
      }
      const evaluatedCommand = decodeAggregateHistoryCommand(
        aggregateVersionArchiveDbConfig,
        archived,
      );
      return {
        admittedCommand,
        outcome: evaluatedCommand.outcome,
        resources: snapshotResources(value.repo.db),
      };
    },
    snapshot(props: { aggregateId: string }) {
      const value = openAggregate(props.aggregateId);
      let recoveryFailure: IAggregateRecoveryFailure | null = null;
      try {
        drain(props.aggregateId);
      } catch (error) {
        if (!(error instanceof NativeAggregateServiceUnavailable)) {
          throw error;
        }
        recoveryFailure = error.failure;
      }
      return { resources: snapshotResources(value.repo.db), recoveryFailure };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const value of aggregates.values()) closeAggregate(value);
      aggregates.clear();
      if (systemDb !== undefined) closeDb(systemDb);
      systemDb = undefined;
      systemId = undefined;
    },
  };

  function snapshotResources(db: IDb<typeof resourcesConfig>) {
    return mapValues(release!.models, model =>
      db
        .select()
        .from(model.drizzleSchema)
        .all()
        .map(row => makeResourceFromEncodedRow(row, model)),
    );
  }
}
