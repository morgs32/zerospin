import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from '@effect/vitest';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import {
  makeAggregateNodeUpgradeJournal,
  readAggregateTabJournal,
  recoverAggregateTabJournal,
} from '@zerospin/browser/AggregateNode/recoverAggregateTabJournal';
import { shouldResetConnectedNode } from '@zerospin/browser/Node/shouldResetConnectedNode';
import { makeStagedCommandJournal } from '@zerospin/browser/stagedCommandJournal/makeStagedCommandJournal';
import { makeStandaloneWorkerRuntime } from '@zerospin/browser/StandaloneNode/makeStandaloneWorkerRuntime';
import { StandaloneBrowserSessionApi } from '@zerospin/browser/StandaloneNode/StandaloneBrowserSessionApi';
import { standaloneStorageKey } from '@zerospin/browser/StandaloneNode/standaloneIdentity';
import { StandaloneSharedWorkerApi } from '@zerospin/browser/StandaloneNode/StandaloneSharedWorkerApi';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import {
  readAggregateFinalCommand,
  readAggregateNodeCommand,
} from '@zerospin/core/AggregateNode/readAggregateNodeRecord';
import type {
  IAggregateJournalOriginal,
  ICheckAggregateJournal,
} from '@zerospin/core/AggregateNode/storage/adoptPublishedAggregateCommandStorageTx';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import type {
  ISqliteClient,
  ISqliteStatementParameter,
} from '@zerospin/core/drizzle/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeMigratableNodeDatabase } from '@zerospin/core/Node/makeMigratableNodeDatabase';
import { makeNodeSqlGate } from '@zerospin/core/Node/makeNodeSqlGate';
import { nodeMigrationLedger } from '@zerospin/core/Node/nodeMigrationLedger';
import { hashNodeValue, sessionKey } from '@zerospin/core/Node/sessionKey';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceNodeOptimisticView } from '@zerospin/core/ServiceNode/makeServiceNodeOptimisticView';
import {
  readServiceFinalCommand,
  readServiceNodeCommand,
} from '@zerospin/core/ServiceNode/readServiceNodeRecord';
import { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from '@zerospin/core/ServiceNode/serviceNodeTables';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { executeStandaloneNext } from '@zerospin/core/StandaloneNode/executeStandaloneNext';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { RpcStub } from 'capnweb';
import { isNotNull, sql, type AnyRelations } from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

import { gameSessionDefinition } from '../../../examples/tic-tac-toe/src/gameSessionDefinition.ts';
import { game } from '../../../examples/tic-tac-toe/src/gameV1.ts';
import { openTestDb } from '../../../tests/support/openTestDb.ts';

const counterV1 = makeModelVersion(
  defineModel({ name: 'counter', abbreviation: 'cnt' }),
  {
    version: 1,
    attributes: { amount: primitives.integer() },
    indexes: [],
  },
);
const models = { counter: counterV1 };
const wasmBinary = readFileSync(
  new URL(import.meta.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm')),
);
const openMemory = () =>
  makeInMemorySQLite3(() => SQLiteESMFactory({ wasmBinary }));
const baselineResource = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_history',
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
  amount: 0,
};
const privateFailure = {
  _tag: 'ZerospinError' as const,
  code: 'history-rejected',
  scope: 'contract' as const,
  message: 'Only the originating input recovers this failure',
  status: null,
  extra: { detail: 'private B failure' },
};

/** Adapt the existing synchronous SQLite client to the Node's async Drizzle owner. */
function nodeDb(
  client: ISqliteClient,
  beforeStatement?: (query: string) => void,
) {
  function execute(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array',
  ): Promise<unknown[][]>;
  function execute(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode: 'object',
  ): Promise<Record<string, unknown>[]>;
  function execute(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array' | 'object',
  ): Promise<(unknown[] | Record<string, unknown>)[]>;
  async function execute(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array' | 'object',
  ) {
    beforeStatement?.(query);
    const rows: (unknown[] | Record<string, unknown>)[] = [];
    for (const statement of client.sqlite3.statements(client.db, query, {
      unscoped: true,
    })) {
      try {
        client.sqlite3.bind_collection(statement, parameters);
        while (client.sqlite3.step(statement) === 100) {
          const row = client.sqlite3.row(statement);
          rows.push(
            rowMode === 'object'
              ? Object.fromEntries(
                  client.sqlite3
                    .column_names(statement)
                    .map((name, index) => [name, row[index]]),
                )
              : row,
          );
        }
      } finally {
        client.sqlite3.finalize(statement);
      }
    }
    return rows;
  }

  function get(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array',
  ): Promise<unknown[] | undefined>;
  function get(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode: 'object',
  ): Promise<Record<string, unknown> | undefined>;
  function get(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array' | 'object',
  ): Promise<unknown[] | Record<string, unknown> | undefined>;
  async function get(
    query: string,
    parameters: ISqliteStatementParameter[],
    rowMode?: 'array' | 'object',
  ): Promise<unknown[] | Record<string, unknown> | undefined> {
    return (await execute(query, parameters, rowMode))[0];
  }

  const executors = {
    all: execute,
    get,
    run: async (query: string, parameters: ISqliteStatementParameter[]) => {
      await execute(query, parameters);
    },
  };
  return Object.assign(drizzle(executors, { codecs: durableSQLiteCodecs }), {
    withRelations: <R extends AnyRelations>(relations: R) =>
      drizzle(executors, { codecs: durableSQLiteCodecs, relations }),
  });
}

// Release verification can populate the test database through an installed, published package.
const publishedCore = process.env.ZEROSPIN_PREVIOUS_CORE_PACKAGE;
const publishedBrowser = process.env.ZEROSPIN_PREVIOUS_BROWSER_PACKAGE;
const publishedJournal: typeof makeStagedCommandJournal = publishedBrowser
  ? (
      await import(
        pathToFileURL(
          resolve(
            publishedBrowser,
            'dist/stagedCommandJournal/makeStagedCommandJournal.js',
          ),
        ).href
      )
    ).makeStagedCommandJournal
  : makeStagedCommandJournal;
const publishedEffectSchema: typeof Schema = publishedCore
  ? await import(
      pathToFileURL(
        createRequire(resolve(publishedCore, 'package.json')).resolve(
          'effect/Schema',
        ),
      ).href
    )
  : Schema;
const publishedOriginalSchema: typeof AggregateNodeCommandSchema = publishedCore
  ? (
      await import(
        pathToFileURL(
          resolve(
            publishedCore,
            'dist/AggregateNode/AggregateNodeCommandSchema.js',
          ),
        ).href
      )
    ).AggregateNodeCommandSchema
  : AggregateNodeCommandSchema;
const publishedAggregateNode: typeof AggregateNode = publishedCore
  ? (
      await import(
        pathToFileURL(
          resolve(publishedCore, 'dist/AggregateNode/AggregateNode.js'),
        ).href
      )
    ).AggregateNode
  : AggregateNode;
const publishedServiceNode: typeof ServiceNode = publishedCore
  ? (
      await import(
        pathToFileURL(resolve(publishedCore, 'dist/ServiceNode/ServiceNode.js'))
          .href
      )
    ).ServiceNode
  : ServiceNode;

describe('Immutable Node history and gap recovery', () => {
  it.effect(
    'Aggregate preserves immutable history and recovers selected and private producer gaps',
    () =>
      Effect.gen(function* () {
        const contract = makeAggregateContractRelease(
          defineAggregateContract('record'),
          {
            version: 1,
            payload: { label: primitives.text() },
            result: Schema.String,
            models: {
              counter: {
                model: models.counter,
                fields: ['createdAt', 'updatedAt', 'amount'],
              },
            },
            operations: {},
            program: ({ payload }) => Effect.succeed(payload.label),
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'history' }),
          { version: 1, models, system: { record: contract }, actors: {} },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'history',
          aggregateName: release.name,
          aggregateVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'history',
          claimsSchema: Schema.Struct({
            aggregateId: Schema.String,
            memberId: Schema.String,
          }),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        let failLedgerStamp = true;
        const db = nodeDb(storage.db.$client, query => {
          if (
            failLedgerStamp &&
            query.startsWith('insert into "applied_migrations"')
          ) {
            throw new Error('Interrupted baseline ledger stamp');
          }
        });
        const context = yield* Effect.context<never>();
        const nodeDefinition = {
          identity: {
            apiUrl: 'https://history.example',
            publishableKey: 'pub_history',
            systemName: definition.systemName,
            aggregateName: definition.aggregateName,
            aggregateVersion: definition.aggregateVersion,
            aggregateId: 'history',
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,
            sessionName: definition.sessionName,
            claims: { aggregateId: 'history', memberId: 'member' },
            definitionHash: yield* Effect.promise(() =>
              hashNodeValue(makeAggregateSessionLock(definition)),
            ),
          },
          lock: makeAggregateSessionLock(definition),
        };
        // Reconstruction reuses the retained SQLite connection and opens only a fresh derived view.
        const openNode = (
          identity = nodeDefinition.identity,
          Node = AggregateNode,
          connection = db,
        ) =>
          Effect.gen(function* () {
            const view = yield* Effect.promise(() =>
              makeAggregateNodeOptimisticView({
                sessionDefinition: definition,
                openMemory,
                runSync: Effect.runSyncWith(context),
              }),
            );
            const opened = new Node(
              connection,
              { ...nodeDefinition, identity },
              view,
              definition,
            );
            yield* Effect.addFinalizer(() =>
              Effect.promise(() => opened.close()),
            );
            return opened;
          });
        const interruptedBaseline = yield* openNode();
        const failedBaseline = yield* Effect.tryPromise({
          try: () => interruptedBaseline.initializeConnectedStorage(),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(failedBaseline)) {
          throw new Error('The interrupted baseline must fail');
        }
        expect(Cause.squash(failedBaseline.cause)).toMatchObject({
          code: 'node-storage-upgrade-invalid',
        });
        expect(
          yield* Effect.promise(() =>
            db.all<{ name: string }>(
              sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
            ),
          ),
        ).toEqual([]);
        yield* Effect.promise(() => interruptedBaseline.close());
        failLedgerStamp = false;
        const node = yield* openNode();
        expect(
          yield* Effect.promise(() => node.initializeConnectedStorage()),
        ).toEqual({ created: true });
        yield* Effect.promise(() =>
          node.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const commandA = {
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_history' as const,
          sessionIndex: 1,
          kind: 'actor' as const,
          aggregateName: definition.aggregateName,
          aggregateVersion: definition.aggregateVersion,
          aggregateId: 'history',
          commandName: contract.commandName,
          contractVersion: contract.version,
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: { aggregateId: 'history', memberId: 'member' },
          payload: JSON.stringify({ label: 'A' }),
          stagingOutcome: {
            result: 'staged A',
            completedAt: '2026-10-26T01:00:00.000Z',
          },
        };
        const commandB = {
          ...commandA,
          sessionIndex: 2,
          payload: JSON.stringify({ label: 'B' }),
          stagingOutcome: {
            result: 'staged B',
            completedAt: '2026-10-26T01:00:01.000Z',
          },
        };
        // Open the actual shipped database using the candidate, including a lost admission reply.
        if (publishedCore) {
          const previous = yield* openTestDb({});
          const connection = nodeDb(previous.db.$client);
          const writer = yield* openNode(
            nodeDefinition.identity,
            publishedAggregateNode,
            connection,
          );
          yield* Effect.promise(() => writer.initializeConnectedStorage());
          yield* Effect.promise(() =>
            writer.initializeBaseline({
              aggregateIndex: 0,
              dispositionChainHash: '0'.repeat(64),
              resolvedThrough: 0,
              resources: [],
            }),
          );
          const first = yield* Effect.promise(() => writer.accept(commandA));
          const hasPredecessors = yield* Effect.promise(() =>
            connection.get(
              sql`SELECT 1 FROM sqlite_schema WHERE name = 'commandDependencies'`,
            ),
          );
          const readPublishedLedger = () =>
            connection
              .select()
              .from(nodeMigrationLedger)
              .orderBy(nodeMigrationLedger.migrationId);
          const initialLedger = yield* Effect.promise(readPublishedLedger);
          const secondInput = hasPredecessors
            ? {
                ...commandB,
                dependsOn: {
                  sessionId: commandA.sessionId,
                  sessionIndex: commandA.sessionIndex,
                },
              }
            : commandB;
          const second = yield* Effect.promise(() =>
            writer.accept(secondInput),
          );
          const third = {
            ...commandB,
            sessionIndex: 3,
            payload: JSON.stringify({ label: 'Friday' }),
            dependsOn: {
              sessionId: commandA.sessionId,
              sessionIndex: commandA.sessionIndex,
            },
          };
          const entries = new Map<string, string>();
          let keepAcknowledged = true;
          vi.stubGlobal('localStorage', {
            get length() {
              return entries.size;
            },
            key: (index: number) => [...entries.keys()][index] ?? null,
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => entries.set(key, value),
            removeItem: (key: string) => {
              if (!keepAcknowledged) entries.delete(key);
            },
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => vi.unstubAllGlobals()),
          );
          const { aggregateId, claims } = nodeDefinition.identity;
          const journal = makeAggregateNodeUpgradeJournal({
            request: {
              apiUrl: nodeDefinition.identity.apiUrl,
              publishableKey: nodeDefinition.identity.publishableKey,
              systemName: definition.systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              sessionName: definition.sessionName,
              lock: nodeDefinition.lock,
            },
            aggregateId,
            expectedClaims: claims,
            isCurrent: () => true,
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => journal[Symbol.dispose]()),
          );
          const signal = new AbortController().signal;
          const checkPage: ICheckAggregateJournal = (nodeId, checkOriginal) =>
            readAggregateTabJournal(
              journal,
              claims,
              nodeId,
              signal,
              async originals => {
                for (const original of originals) await checkOriginal(original);
              },
            );
          if (hasPredecessors) {
            const saved = publishedJournal<IAggregateJournalOriginal>({
              prefix: 'aggregate',
              identityKey: yield* Effect.promise(() =>
                sessionKey(nodeDefinition.identity),
              ),
              nodeId: first.nodeId,
              decode: input =>
                publishedEffectSchema.decodeUnknownSync(
                  publishedOriginalSchema.members[0],
                )(input, { onExcessProperty: 'error' }),
            });
            saved.write({ ...commandB, dependsOn: third.dependsOn }); // retained in SQLite, acknowledgement lost
            saved.write(third); // only copy is in the tab journal
            expect(entries.size).toBe(2);
            const before = [...entries];
            const candidate = yield* openNode(
              nodeDefinition.identity,
              AggregateNode,
              connection,
            );
            yield* Effect.promise(() =>
              expect(
                candidate.initializeConnectedStorage(
                  false,
                  undefined,
                  checkPage,
                ),
              ).rejects.toMatchObject({
                code: 'node-storage-upgrade-predecessor-pending',
              }),
            );
            expect([...entries]).toEqual(before);
            expect(
              yield* Effect.promise(() =>
                connection.all(
                  sql`SELECT * FROM applied_migrations ORDER BY migrationId`,
                ),
              ),
            ).toEqual(initialLedger);
            expect(
              yield* Effect.promise(() =>
                connection.all(
                  sql`SELECT predecessorIndex FROM commandDependencies`,
                ),
              ),
            ).toEqual([{ predecessorIndex: 1 }]);
            yield* Effect.promise(() => candidate.close());
          }
          yield* Effect.promise(() =>
            writer.receiveCommand({
              id: makeNodeCommandId(first.nodeId, first.pushIndex),
              commandName: 'record',
              aggregateIndex: 1,
              dispositionChainHash: '1'.repeat(64),
              failure: hasPredecessors ? privateFailure : null,
              delta: { upserted: [], deleted: [] },
            }),
          );
          yield* Effect.promise(() => writer.close());
          const reader = yield* openNode(
            nodeDefinition.identity,
            AggregateNode,
            connection,
          );
          if (hasPredecessors) {
            // 48.0.0 also supported stamp 23. Use its shipped physical table and actual ledger prefix.
            const releasedV23 = yield* Effect.promise(
              () =>
                import(
                  pathToFileURL(
                    resolve(
                      publishedCore,
                      'dist/AggregateNode/storage/aggregateNodeStorageV23.js',
                    ),
                  ).href
                ),
            );
            yield* Effect.promise(async () => {
              await connection.run(
                sql.raw(
                  releasedV23.aggregateNodeUploadRequirementsDefinition
                    .createTable,
                ),
              );
              await connection.run(
                sql`DELETE FROM applied_migrations WHERE migrationId = 2`,
              );
              await connection.run(sql`PRAGMA user_version = 23`);
              await connection.run(
                sql`INSERT INTO uploadRequirements VALUES (${commandB.sessionId}, ${commandB.sessionIndex}, '[]')`,
              );
              const before = await readPublishedLedger();
              await expect(
                reader.initializeConnectedStorage(false, undefined, checkPage),
              ).rejects.toMatchObject({
                code: 'node-storage-upgrade-upload-pending',
              });
              expect(await readPublishedLedger()).toEqual(before);
              expect(
                await connection.get(
                  sql`SELECT operations FROM uploadRequirements`,
                ),
              ).toEqual({ operations: '[]' });
              expect(entries.size).toBe(2);
              // Restore the released writer's v24 fixture for the remaining predecessor cases.
              await connection.run(sql`DROP TABLE uploadRequirements`);
              await connection
                .insert(nodeMigrationLedger)
                .values(initialLedger[2]!);
              await connection.run(sql`PRAGMA user_version = 24`);
            });
          }
          if (hasPredecessors) {
            for (const [invalid, code] of [
              [
                {
                  ...third,
                  dependsOn: { sessionId: 'sesn_other', sessionIndex: 1 },
                },
                'node-storage-upgrade-journal-invalid',
              ],
              [
                {
                  ...third,
                  dependsOn: { sessionId: third.sessionId, sessionIndex: 3 },
                },
                'node-storage-upgrade-journal-invalid',
              ],
              [
                {
                  ...third,
                  dependsOn: { sessionId: third.sessionId, sessionIndex: 2 },
                },
                'node-storage-upgrade-predecessor-pending',
              ],
              [
                { ...third, claims: { ...claims, memberId: 'other' } },
                'node-command-identity-mismatch',
              ],
              [
                { ...third, ...commandB, payload: 'different bytes' },
                'node-storage-upgrade-journal-invalid',
              ],
            ] as const) {
              yield* Effect.promise(() =>
                expect(
                  reader.initializeConnectedStorage(
                    false,
                    undefined,
                    (_, checkOriginal) => checkOriginal(invalid),
                  ),
                ).rejects.toMatchObject({ code }),
              );
              expect(
                yield* Effect.promise(() =>
                  connection.all(
                    sql`SELECT * FROM applied_migrations ORDER BY migrationId`,
                  ),
                ),
              ).toEqual(initialLedger);
            }
          }
          yield* Effect.promise(() =>
            reader.initializeConnectedStorage(
              false,
              {
                aggregateIndex: 1,
                dispositionChainHash: '1'.repeat(64),
                resolvedThrough: 1,
                resources: [],
              },
              checkPage,
            ),
          );
          if (hasPredecessors) {
            const recover = () =>
              recoverAggregateTabJournal({
                node: reader,
                identity: nodeDefinition.identity,
                journal,
                signal,
                assertCurrent: () => signal.throwIfAborted(),
              });
            yield* Effect.promise(recover);
            expect(entries.size).toBe(2);
            keepAcknowledged = false;
            yield* Effect.promise(recover);
            expect(entries.size).toBe(0);
            expect(
              yield* Effect.promise(() =>
                connection.all(
                  sql`SELECT sessionIndex, pushIndex, payload FROM commands WHERE pushIndex IS NOT NULL ORDER BY pushIndex`,
                ),
              ),
            ).toEqual(
              [commandA, commandB, third].map(command => ({
                sessionIndex: command.sessionIndex,
                pushIndex: command.sessionIndex,
                payload: command.payload,
              })),
            );
          }
          if (hasPredecessors) {
            expect(
              yield* Effect.promise(() =>
                connection.all(
                  sql`SELECT * FROM aggregate_command_migrations_48_0_0 ORDER BY migrationId`,
                ),
              ),
            ).toEqual(initialLedger);
          }
          expect(
            (yield* Effect.promise(() => reader.snapshot())).outcomeIndex,
          ).toBe(1);
          expect(yield* Effect.promise(() => reader.accept(commandB))).toEqual(
            second,
          );
          expect(yield* Effect.promise(() => reader.nextPush())).toMatchObject({
            id: makeNodeCommandId(second.nodeId, second.pushIndex),
            payload: commandB.payload,
          });
          yield* Effect.promise(() => reader.close());
        }
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        const originalRows = yield* Effect.promise(() =>
          db.select().from(aggregateNodeCommands),
        );
        const readStorage = () =>
          Promise.all([
            db.select().from(aggregateNodeCommands),
            db.select().from(aggregateNodeMetadata),
            db.select().from(counterV1.drizzleSchema),
          ]);
        const finalB = {
          id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
          commandName: 'record',
          aggregateIndex: 1,
          dispositionChainHash: '1'.repeat(64),
          failure: privateFailure,
          delta: { upserted: [], deleted: [] },
        };
        const beforeGap = yield* Effect.promise(readStorage);
        const gap = yield* Effect.tryPromise({
          try: () => node.receiveCommand({ ...finalB, aggregateIndex: 2 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(gap)) {
          throw new Error('Expected a missing selected position to refuse');
        }
        expect(Cause.squash(gap.cause)).toMatchObject({
          code: 'node-execution-gap',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeGap);
        expect(node.status()).toMatchObject({ blockedWork: true });
        yield* Effect.promise(() => node.close());
        const resumed = yield* openNode();
        expect(
          yield* Effect.promise(() =>
            resumed.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        expect(
          yield* Effect.promise(() =>
            db.all<{ name: string }>(
              sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('commandDependencies', 'uploadRequirements')`,
            ),
          ),
        ).toEqual([]);
        yield* Effect.promise(() => resumed.receiveCommand(finalB));
        const pendingCommands = [
          {
            ...commandA,
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
          },
          {
            ...commandB,
            id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            pushIndex: retainedB.pushIndex,
          },
        ];
        const firstGap = yield* Effect.promise(() =>
          resumed.snapshot({ pendingCommands }),
        );
        expect(firstGap).toMatchObject({
          nodeIndex: 3,
          pushIndex: 2,
          outcomeIndex: 0,
          metadata: { aggregateIndex: 1, admittedThroughPushIndex: 2 },
          resources: [{ amount: 0 }],
        });
        expect(firstGap.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: retainedA.pushIndex,
            commandName: 'record',
            nodeId: retainedA.nodeId,
            nodeIndex: 1,
            resolution: null,
          },
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: retainedB.pushIndex,
            commandName: 'record',
            nodeId: retainedB.nodeId,
            nodeIndex: 2,
            resolution: {
              id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
              commandName: 'record',
              aggregateIndex: 1,
              failure: privateFailure,
            },
          },
        ]);
        // No input interest means no private resolution, even though this Node retains B's failure.
        expect(
          (yield* Effect.promise(() => resumed.snapshot())).commandCoverage,
        ).toEqual([]);
        const beforeRewind = yield* Effect.promise(readStorage);
        const rewind = yield* Effect.tryPromise({
          try: () => resumed.reconcileAdmission(1),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(rewind)) {
          throw new Error(
            'Expected retained final proof to prevent admission rewind',
          );
        }
        expect(Cause.squash(rewind.cause)).toMatchObject({
          code: 'node-admission-history-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeRewind);
        expect(yield* Effect.promise(() => resumed.nextPush())).toBeNull();
        yield* Effect.promise(() => resumed.close());
        const recovered = yield* openNode();
        expect(
          yield* Effect.promise(() =>
            recovered.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        expect(
          yield* Effect.promise(() => recovered.snapshot({ pendingCommands })),
        ).toMatchObject({
          outcomeIndex: 0,
          metadata: { aggregateIndex: 1, admittedThroughPushIndex: 2 },
        });
        yield* Effect.promise(() =>
          recovered.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'record',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 1 }],
              deleted: [],
            },
          }),
        );
        const filled = yield* Effect.promise(() =>
          recovered.snapshot({ pendingCommands }),
        );
        expect(filled).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 2,
          metadata: { aggregateIndex: 2, admittedThroughPushIndex: 2 },
          resources: [{ amount: 1 }],
        });
        const history = yield* Effect.promise(() =>
          recovered.history({ afterNodeIndex: 0, limit: 10 }),
        );
        expect(history.filter(row => row.pushIndex !== null)).toEqual(
          originalRows,
        );
        expect(
          history.map(row => ({
            id: row.id,
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            aggregateIndex: row.aggregateIndex,
          })),
        ).toEqual([
          { id: null, nodeIndex: 1, pushIndex: 1, aggregateIndex: null },
          { id: null, nodeIndex: 2, pushIndex: 2, aggregateIndex: null },
          {
            id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
            nodeIndex: 3,
            pushIndex: null,
            aggregateIndex: 1,
          },
          {
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            nodeIndex: 4,
            pushIndex: null,
            aggregateIndex: 2,
          },
        ]);
        expect(
          yield* Effect.promise(() =>
            recovered.history({ afterNodeIndex: 2, limit: 1 }),
          ),
        ).toEqual([history[2]]);
        const beforeRetry = yield* Effect.promise(readStorage);
        yield* Effect.promise(() => recovered.receiveCommand(finalB));
        expect(yield* Effect.promise(() => recovered.accept(commandA))).toEqual(
          retainedA,
        );
        expect(yield* Effect.promise(readStorage)).toEqual(beforeRetry);
        const foreignFinal = {
          id: 'cmd_foreign' as const,
          commandName: 'foreignOnly',
          aggregateIndex: 3,
          dispositionChainHash: '3'.repeat(64),
          failure: null,
          delta: {
            upserted: [{ ...baselineResource, amount: 2 }],
            deleted: [],
          },
        };
        yield* Effect.promise(() => recovered.receiveCommand(foreignFinal));
        const beforeConflict = yield* Effect.promise(readStorage);
        const forgedSubmission = {
          ...commandA,
          id: foreignFinal.id,
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
        };
        const finalOnly = yield* Effect.tryPromise({
          try: () => recovered.accept(forgedSubmission),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(finalOnly)) {
          throw new Error(
            'Expected a forged retained command identity to refuse',
          );
        }
        expect(Cause.squash(finalOnly.cause)).toMatchObject({
          code: 'session-staged-coordinate-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        const retainedForeign = (yield* Effect.promise(() =>
          db.select().from(aggregateNodeCommands),
        )).find(row => row.id === foreignFinal.id)!;
        expect(
          readAggregateFinalCommand(retainedForeign, retainedA.nodeId),
        ).toMatchObject(foreignFinal);
        const originalA = originalRows.find(
          row => row.sessionIndex === commandA.sessionIndex,
        )!;
        expect(
          readAggregateNodeCommand(originalA, retainedA.nodeId, nodeDefinition),
        ).toMatchObject({
          ...commandA,
          id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
        });
        // Readers reject incoherent durable positions without mutating the real retained rows.
        for (const nodeIndex of [0, Number.MAX_SAFE_INTEGER + 1]) {
          for (const invalid of [
            {
              read: () =>
                readAggregateNodeCommand(
                  { ...originalA, nodeIndex },
                  retainedA.nodeId,
                  nodeDefinition,
                ),
              code: 'node-command-input-missing',
            },
            {
              read: () =>
                readAggregateFinalCommand(
                  { ...retainedForeign, nodeIndex },
                  retainedA.nodeId,
                ),
              code: 'node-command-final-missing',
            },
          ]) {
            const refused = yield* Effect.sync(() => invalid.read()).pipe(
              Effect.exit,
            );
            if (Exit.isSuccess(refused)) {
              throw new Error('Expected invalid retained position to refuse');
            }
            expect(Cause.squash(refused.cause)).toMatchObject({
              code: invalid.code,
            });
          }
        }
        for (const invalid of [
          {
            read: () =>
              readAggregateNodeCommand(
                { ...originalA, failure: privateFailure },
                retainedA.nodeId,
                nodeDefinition,
              ),
            code: 'node-command-input-missing',
          },
          {
            read: () =>
              readAggregateFinalCommand(
                { ...retainedForeign, pushIndex: 3 },
                retainedA.nodeId,
              ),
            code: 'node-command-final-missing',
          },
        ]) {
          const refused = yield* Effect.sync(() => invalid.read()).pipe(
            Effect.exit,
          );
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected mixed retained phases to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: invalid.code,
          });
        }
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        const conflict = yield* Effect.tryPromise({
          try: () =>
            recovered.receiveCommand({
              ...finalB,
              delta: {
                upserted: [{ ...baselineResource, amount: 999 }],
                deleted: [],
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(conflict)) {
          throw new Error('Expected changed immutable final data to refuse');
        }
        expect(Cause.squash(conflict.cause)).toMatchObject({
          code: 'node-outcome-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);

        // Authenticated repair keeps original allocations and reconstructs derived final evidence.
        const repairBaseline = {
          aggregateIndex: 3,
          dispositionChainHash: '3'.repeat(64),
          resolvedThrough: 2,
          resources: [{ ...baselineResource, amount: 2 }],
        };
        const missingOriginal = yield* Effect.tryPromise({
          try: () =>
            recovered.repairConnectedBaseline({
              ...repairBaseline,
              resolvedThrough: 3,
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(missingOriginal)) {
          throw new Error(
            'Expected an incomplete original stream to refuse repair',
          );
        }
        expect(Cause.squash(missingOriginal.cause)).toMatchObject({
          code: 'node-command-input-missing',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        yield* Effect.promise(() => recovered.setPushPaused(true));
        let recoveryClaimed = false;
        recovered.setConnectedRecoveryHandler(() => {
          recoveryClaimed = true;
          return true;
        });
        yield* Effect.promise(() =>
          db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: 'damaged' }),
        );
        const damagedSnapshot = yield* Effect.tryPromise({
          try: () => recovered.snapshot(),
          catch: error => error,
        }).pipe(Effect.exit);
        expect(Exit.isFailure(damagedSnapshot)).toBe(true);
        expect(recoveryClaimed).toBe(true);
        const pausedSubmission = yield* Effect.tryPromise({
          try: () => recovered.accept(commandA),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(pausedSubmission)) {
          throw new Error('Expected claimed recovery to fence submissions');
        }
        expect(Cause.squash(pausedSubmission.cause)).toMatchObject({
          code: 'node-staging-blocked',
        });
        const releaseRepair = yield* Effect.promise(() =>
          recovered.prepareReset(undefined, true),
        );
        expect(
          yield* Effect.promise(() =>
            recovered.readConnectedRecoveryIdentity(),
          ),
        ).toBe(retainedA.nodeId);
        yield* Effect.promise(() =>
          recovered.repairConnectedBaseline(repairBaseline),
        );
        expect(
          yield* Effect.promise(() => db.select().from(aggregateNodeCommands)),
        ).toEqual(originalRows);
        yield* Effect.promise(() => recovered.receiveCommand(finalB));
        yield* Effect.promise(() =>
          recovered.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'record',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 999 }],
              deleted: [],
            },
          }),
        );
        yield* Effect.promise(() => releaseRepair(true));
        recovered.setConnectedRecoveryHandler(undefined);
        expect(yield* Effect.promise(() => recovered.accept(commandA))).toEqual(
          retainedA,
        );
        expect(
          yield* Effect.promise(() => recovered.snapshot({ pendingCommands })),
        ).toMatchObject({
          outcomeIndex: 2,
          metadata: {
            nodeId: retainedA.nodeId,
            aggregateIndex: 3,
            admittedThroughPushIndex: 2,
            pushPaused: true,
          },
          resources: [{ amount: 2 }],
        });
        // Refused connected opens preserve history, producer identity, ledger and version.
        const mismatchedBinding = yield* openNode({
          ...nodeDefinition.identity,
          definitionHash: 'different-definition',
        });
        const readUpgradeState = () =>
          Promise.all([
            readStorage(),
            db.select().from(nodeMigrationLedger),
            db.values<[number]>(sql`PRAGMA user_version`),
          ]);
        const beforeRefusal = yield* Effect.promise(readUpgradeState);
        for (const invalid of [
          { node: mismatchedBinding, code: 'node-storage-identity-mismatch' },
          { node: recovered, code: 'node-storage-upgrade-schema-mismatch' },
        ]) {
          if (invalid.node === recovered) {
            yield* Effect.promise(() =>
              db.run(
                sql`CREATE INDEX unexpected_connected_storage ON commands (sessionIndex)`,
              ),
            );
          }
          const refused = yield* Effect.tryPromise({
            try: () => invalid.node.initializeConnectedStorage(false),
            catch: error => error,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Invalid connected storage must refuse');
          }
          const failure = Cause.squash(refused.cause);
          expect(failure).toMatchObject({ code: invalid.code });
          expect(shouldResetConnectedNode({ failure, attempted: false })).toBe(
            false,
          );
          expect(yield* Effect.promise(readUpgradeState)).toEqual(
            beforeRefusal,
          );
        }
        expect(
          yield* Effect.promise(() =>
            db.all<{ name: string }>(
              sql`SELECT name FROM sqlite_master WHERE name = 'unexpected_connected_storage'`,
            ),
          ),
        ).toEqual([{ name: 'unexpected_connected_storage' }]);
        yield* Effect.promise(() =>
          db.run(sql`DROP INDEX unexpected_connected_storage`),
        );
        yield* Effect.promise(() => mismatchedBinding.close());
        const pending = yield* Effect.promise(() =>
          recovered.accept({
            ...commandA,
            sessionIndex: 3,
            payload: JSON.stringify({ label: 'Friday' }),
          }),
        );
        expect(pending.pushIndex).toBe(3);
        expect(yield* Effect.promise(() => recovered.nextPush())).toBeNull();
        const readDurableBytes = () =>
          Promise.all([
            db.values(sql`SELECT * FROM commands ORDER BY nodeIndex`),
            db.values(sql`SELECT * FROM nodeMetadata`),
            db.values(sql`SELECT * FROM counter`),
          ]);
        const beforeMigrations = yield* Effect.promise(readDurableBytes);
        // This release keeps the same TypeScript property and moves the bytes to a renamed SQLite column.
        const newCommands = sqliteTable(
          'commands',
          {
            nodeIndex: integer().primaryKey(),
            id: text(),
            sessionId: text(),
            sessionIndex: integer(),
            pushIndex: integer().unique(),
            commandName: text().notNull(),
            payload: text('encodedPayload'),
            claims: text(),
            stagingOutcome: text(),
            failure: text(),
            aggregateIndex: integer().unique(),
            dispositionChainHash: text(),
            exposedDelta: text(),
          },
          table => [
            uniqueIndex('commands_session_submission')
              .on(table.sessionId, table.sessionIndex)
              .where(isNotNull(table.pushIndex)),
            uniqueIndex('commands_final_id')
              .on(table.id)
              .where(isNotNull(table.aggregateIndex)),
          ],
        );
        const candidate = (destination: string) =>
          makeMigratableNodeDatabase({
            baselineVersion: 24,
            tables: [aggregateNodeMetadata, newCommands],
            publishedBaselineTables: [
              aggregateNodeMetadata,
              aggregateNodeCommands,
            ],
            migrations: [
              {
                id: 1,
                name: 'store-command-payload',
                sql: [
                  'ALTER TABLE commands RENAME COLUMN payload TO storedPayload',
                ],
              },
              {
                id: 2,
                name: 'encode-command-payload',
                sql: [
                  `ALTER TABLE commands RENAME COLUMN storedPayload TO ${destination}`,
                ],
              },
            ],
          });
        const openCandidate = (destination: string, connection = db) =>
          candidate(destination).initializeSchema(connection, {
            transaction: makeNodeSqlGate(connection, () => {}).transaction,
            create: false,
            verifyBinding: async () => {
              const metadata = await connection.get<{ nodeId: string }>(
                sql`SELECT nodeId FROM nodeMetadata`,
              );
              expect(metadata?.nodeId).toBe(pending.nodeId);
            },
            initializeProducer: async () => {
              throw new Error('Expected retained producer');
            },
          });
        const interruptedDb = nodeDb(storage.db.$client, query => {
          if (query.includes('PRAGMA user_version = 26')) {
            throw new Error('Interrupted before final commit');
          }
        });
        const readStamp = () => db.values<[number]>(sql`PRAGMA user_version`);
        const readLedger = () =>
          db
            .select()
            .from(nodeMigrationLedger)
            .orderBy(nodeMigrationLedger.migrationId);
        const readColumns = () =>
          db
            .all<{ name: string }>(sql`PRAGMA table_info(commands)`)
            .then(rows => rows.map(row => row.name));
        yield* Effect.promise(() =>
          expect(
            openCandidate('encodedPayload', interruptedDb),
          ).rejects.toThrow(),
        );
        expect(yield* Effect.promise(readStamp)).toEqual([[25]]);
        const intermediate = yield* Effect.promise(readLedger);
        expect(intermediate.map(row => row.migrationId)).toEqual([0, 1]);
        expect(yield* Effect.promise(readColumns)).toContain('storedPayload');
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        yield* Effect.promise(() =>
          expect(openCandidate('encodedPaylod')).rejects.toMatchObject({
            code: 'node-storage-upgrade-schema-mismatch',
          }),
        );
        expect(yield* Effect.promise(readStamp)).toEqual([[25]]);
        expect(yield* Effect.promise(readLedger)).toEqual(intermediate);
        expect(yield* Effect.promise(readColumns)).toContain('storedPayload');
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        yield* Effect.promise(() => openCandidate('encodedPayload'));
        expect(yield* Effect.promise(readStamp)).toEqual([[26]]);
        expect(
          (yield* Effect.promise(readLedger)).map(row => row.migrationId),
        ).toEqual([0, 1, 2]);
        expect(yield* Effect.promise(readColumns)).toContain('encodedPayload');
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        expect(
          yield* Effect.promise(() =>
            db.get(
              sql`SELECT encodedPayload FROM commands WHERE pushIndex = 3`,
            ),
          ),
        ).toEqual({
          encodedPayload: JSON.stringify({ label: 'Friday' }),
        });
        expect(
          yield* Effect.promise(() =>
            db.get(sql`SELECT pushPaused FROM nodeMetadata`),
          ),
        ).toEqual({ pushPaused: 1 });
        const freshFile = yield* openTestDb({});
        const freshDb = nodeDb(freshFile.db.$client);
        yield* Effect.promise(() =>
          expect(
            candidate('encodedPayload').initializeSchema(freshDb, {
              transaction: makeNodeSqlGate(freshDb, () => {}).transaction,
              create: true,
              readTables: [{ name: 'COMMANDS' }],
              verifyBinding: async () => {},
              initializeProducer: async () => {
                throw new Error(
                  'Cannot initialize overlapping durable and read tables',
                );
              },
            }),
          ).rejects.toMatchObject({
            code: 'node-storage-upgrade-schema-mismatch',
          }),
        );
        expect(
          yield* Effect.promise(() => freshDb.values(sql`PRAGMA user_version`)),
        ).toEqual([[0]]);
        const fresh = yield* Effect.promise(() =>
          candidate('encodedPayload').initializeSchema(freshDb, {
            transaction: makeNodeSqlGate(freshDb, () => {}).transaction,
            create: true,
            verifyBinding: async () => {
              throw new Error('Expected fresh file');
            },
            initializeProducer: async () => {
              const [producer] = await db.select().from(aggregateNodeMetadata);
              await freshDb.insert(aggregateNodeMetadata).values(producer!);
            },
          }),
        );
        expect(fresh.created).toBe(true);
        expect(
          yield* Effect.promise(() =>
            freshDb.select().from(nodeMigrationLedger),
          ),
        ).toEqual(yield* Effect.promise(readLedger));
        expect(
          yield* Effect.promise(() =>
            freshDb.values(sql`PRAGMA table_info(commands)`),
          ),
        ).toEqual(
          yield* Effect.promise(() =>
            db.values(sql`PRAGMA table_info(commands)`),
          ),
        );
        const olderRuntime = yield* Effect.tryPromise({
          try: () => recovered.initializeConnectedStorage(false),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(olderRuntime)) {
          throw new Error('An older runtime must refuse newer storage');
        }
        expect(Cause.squash(olderRuntime.cause)).toMatchObject({
          code: 'node-storage-upgrade-newer',
        });
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        yield* Effect.promise(() =>
          db.run(
            sql`UPDATE applied_migrations SET definitionChecksum = 'changed' WHERE migrationId = 1`,
          ),
        );
        const rewrittenHistory = yield* Effect.tryPromise({
          try: () => openCandidate('encodedPayload'),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(rewrittenHistory)) {
          throw new Error('Changed migration history must refuse');
        }
        expect(Cause.squash(rewrittenHistory.cause)).toMatchObject({
          code: 'node-storage-upgrade-history-invalid',
        });
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        yield* Effect.promise(() => db.run(sql`DROP TABLE applied_migrations`));
        const unstamped = yield* Effect.tryPromise({
          try: () => openCandidate('encodedPayload'),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(unstamped)) {
          throw new Error('Nonempty unstamped storage must not be adopted');
        }
        expect(Cause.squash(unstamped.cause)).toMatchObject({
          code: 'node-storage-upgrade-ledger-missing',
        });
        expect(yield* Effect.promise(readDurableBytes)).toEqual(
          beforeMigrations,
        );
        yield* Effect.promise(() =>
          recovered.resetConnectedBaseline({
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
      }),
  );

  it.effect(
    'Service preserves immutable history and recovers selected and private producer gaps',
    () =>
      Effect.gen(function* () {
        const contract = makeServiceContractRelease(
          defineServiceContract('record'),
          {
            version: 1,
            payload: { label: primitives.text() },
            result: Schema.String,
            models: {
              counter: {
                model: models.counter,
                fields: ['createdAt', 'updatedAt', 'amount'],
              },
            },
            operations: {},
            program: ({ payload }) => Effect.succeed(payload.label),
          },
        );
        const release = makeServiceRelease(defineService({ name: 'history' }), {
          version: 1,
          models,
          system: { record: contract },
        });
        const definition = makeServiceSessionDefinition({
          systemName: 'history',
          serviceName: release.name,
          serviceVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'history',
          claimsSchema: Schema.Struct({ memberId: Schema.String }),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const context = yield* Effect.context<never>();
        const nodeDefinition = {
          identity: {
            apiUrl: 'https://history.example',
            publishableKey: 'pub_history',
            systemName: definition.systemName,
            serviceName: definition.serviceName,
            serviceVersion: definition.serviceVersion,
            actorName: definition.actorName,
            actorVersion: definition.actorVersion,
            sessionName: definition.sessionName,
            claims: { memberId: 'member' },
            definitionHash: 'history',
          },
          lock: makeServiceSessionLock(definition),
        };
        // Reconstruction reuses the retained SQLite connection and opens only a fresh derived view.
        const openNode = (
          identity = nodeDefinition.identity,
          Node = ServiceNode,
          connection = db,
        ) =>
          Effect.gen(function* () {
            const view = yield* Effect.promise(() =>
              makeServiceNodeOptimisticView({
                sessionDefinition: definition,
                openMemory,
                runSync: Effect.runSyncWith(context),
              }),
            );
            const opened = new Node(
              connection,
              { ...nodeDefinition, identity },
              view,
              definition,
            );
            yield* Effect.addFinalizer(() =>
              Effect.promise(() => opened.close()),
            );
            return opened;
          });
        const node = yield* openNode();
        expect(
          yield* Effect.promise(() => node.initializeConnectedStorage()),
        ).toEqual({ created: true });
        yield* Effect.promise(() =>
          node.initializeBaseline({
            serviceIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const commandA = {
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_history' as const,
          sessionIndex: 1,
          kind: 'actor' as const,
          serviceName: definition.serviceName,
          commandName: contract.commandName,
          contractVersion: contract.version,
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: { memberId: 'member' },
          payload: JSON.stringify({ label: 'A' }),
          stagingOutcome: {
            result: 'staged A',
            completedAt: '2026-10-26T01:00:00.000Z',
          },
        };
        const commandB = {
          ...commandA,
          sessionIndex: 2,
          payload: JSON.stringify({ label: 'B' }),
          stagingOutcome: {
            result: 'staged B',
            completedAt: '2026-10-26T01:00:01.000Z',
          },
        };
        if (publishedCore) {
          const previous = yield* openTestDb({});
          const connection = nodeDb(previous.db.$client);
          const writer = yield* openNode(
            nodeDefinition.identity,
            publishedServiceNode,
            connection,
          );
          yield* Effect.promise(() => writer.initializeConnectedStorage());
          yield* Effect.promise(() =>
            writer.initializeBaseline({
              serviceIndex: 0,
              dispositionChainHash: '0'.repeat(64),
              resolvedThrough: 0,
              resources: [],
            }),
          );
          const first = yield* Effect.promise(() => writer.accept(commandA));
          const second = yield* Effect.promise(() => writer.accept(commandB));
          yield* Effect.promise(() =>
            writer.receiveCommand({
              id: makeNodeCommandId(first.nodeId, first.pushIndex),
              commandName: 'record',
              serviceIndex: 1,
              dispositionChainHash: '1'.repeat(64),
              failure: privateFailure,
              delta: { upserted: [], deleted: [] },
            }),
          );
          yield* Effect.promise(() => writer.close());
          const reader = yield* openNode(
            nodeDefinition.identity,
            ServiceNode,
            connection,
          );
          yield* Effect.promise(() =>
            reader.initializeConnectedStorage(false, {
              serviceIndex: 1,
              dispositionChainHash: '1'.repeat(64),
              resolvedThrough: 1,
              resources: [],
            }),
          );
          expect(
            (yield* Effect.promise(() => reader.snapshot())).outcomeIndex,
          ).toBe(1);
          expect(yield* Effect.promise(() => reader.accept(commandB))).toEqual(
            second,
          );
          expect(yield* Effect.promise(() => reader.nextPush())).toMatchObject({
            id: makeNodeCommandId(second.nodeId, second.pushIndex),
            payload: commandB.payload,
          });
          yield* Effect.promise(() => reader.close());
        }
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        const originalRows = yield* Effect.promise(() =>
          db.select().from(serviceNodeCommands),
        );
        const readStorage = () =>
          Promise.all([
            db.select().from(serviceNodeCommands),
            db.select().from(serviceNodeMetadata),
            db.select().from(counterV1.drizzleSchema),
          ]);
        const finalB = {
          id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
          commandName: 'record',
          serviceIndex: 1,
          dispositionChainHash: '1'.repeat(64),
          failure: privateFailure,
          delta: { upserted: [], deleted: [] },
        };
        const beforeGap = yield* Effect.promise(readStorage);
        const gap = yield* Effect.tryPromise({
          try: () => node.receiveCommand({ ...finalB, serviceIndex: 2 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(gap)) {
          throw new Error('Expected a missing selected position to refuse');
        }
        expect(Cause.squash(gap.cause)).toMatchObject({
          code: 'node-execution-gap',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeGap);
        expect(node.status()).toMatchObject({ blockedWork: true });
        yield* Effect.promise(() => node.close());
        const resumed = yield* openNode();
        expect(
          yield* Effect.promise(() =>
            resumed.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        yield* Effect.promise(() => resumed.receiveCommand(finalB));
        const pendingCommands = [
          {
            ...commandA,
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
          },
          {
            ...commandB,
            id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            pushIndex: retainedB.pushIndex,
          },
        ];
        const firstGap = yield* Effect.promise(() =>
          resumed.snapshot({ pendingCommands }),
        );
        expect(firstGap).toMatchObject({
          nodeIndex: 3,
          pushIndex: 2,
          outcomeIndex: 0,
          metadata: { serviceIndex: 1, admittedThroughPushIndex: 2 },
          resources: [{ amount: 0 }],
        });
        expect(firstGap.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: retainedA.pushIndex,
            commandName: 'record',
            nodeId: retainedA.nodeId,
            nodeIndex: 1,
            resolution: null,
          },
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: retainedB.pushIndex,
            commandName: 'record',
            nodeId: retainedB.nodeId,
            nodeIndex: 2,
            resolution: {
              id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
              commandName: 'record',
              serviceIndex: 1,
              failure: privateFailure,
            },
          },
        ]);
        // No input interest means no private resolution, even though this Node retains B's failure.
        expect(
          (yield* Effect.promise(() => resumed.snapshot())).commandCoverage,
        ).toEqual([]);
        const beforeRewind = yield* Effect.promise(readStorage);
        const rewind = yield* Effect.tryPromise({
          try: () => resumed.reconcileAdmission(1),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(rewind)) {
          throw new Error(
            'Expected retained final proof to prevent admission rewind',
          );
        }
        expect(Cause.squash(rewind.cause)).toMatchObject({
          code: 'node-admission-history-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeRewind);
        expect(yield* Effect.promise(() => resumed.nextPush())).toBeNull();
        yield* Effect.promise(() => resumed.close());
        const recovered = yield* openNode();
        expect(
          yield* Effect.promise(() =>
            recovered.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        expect(
          yield* Effect.promise(() => recovered.snapshot({ pendingCommands })),
        ).toMatchObject({
          outcomeIndex: 0,
          metadata: { serviceIndex: 1, admittedThroughPushIndex: 2 },
        });
        yield* Effect.promise(() =>
          recovered.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'record',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 1 }],
              deleted: [],
            },
          }),
        );
        const filled = yield* Effect.promise(() =>
          recovered.snapshot({ pendingCommands }),
        );
        expect(filled).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 2,
          metadata: { serviceIndex: 2, admittedThroughPushIndex: 2 },
          resources: [{ amount: 1 }],
        });
        const history = yield* Effect.promise(() =>
          recovered.history({ afterNodeIndex: 0, limit: 10 }),
        );
        expect(history.filter(row => row.pushIndex !== null)).toEqual(
          originalRows,
        );
        expect(
          history.map(row => ({
            id: row.id,
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            serviceIndex: row.serviceIndex,
          })),
        ).toEqual([
          { id: null, nodeIndex: 1, pushIndex: 1, serviceIndex: null },
          { id: null, nodeIndex: 2, pushIndex: 2, serviceIndex: null },
          {
            id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
            nodeIndex: 3,
            pushIndex: null,
            serviceIndex: 1,
          },
          {
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            nodeIndex: 4,
            pushIndex: null,
            serviceIndex: 2,
          },
        ]);
        expect(
          yield* Effect.promise(() =>
            recovered.history({ afterNodeIndex: 2, limit: 1 }),
          ),
        ).toEqual([history[2]]);
        const beforeRetry = yield* Effect.promise(readStorage);
        yield* Effect.promise(() => recovered.receiveCommand(finalB));
        expect(yield* Effect.promise(() => recovered.accept(commandA))).toEqual(
          retainedA,
        );
        expect(yield* Effect.promise(readStorage)).toEqual(beforeRetry);
        const foreignFinal = {
          id: 'cmd_foreign' as const,
          commandName: 'foreignOnly',
          serviceIndex: 3,
          dispositionChainHash: '3'.repeat(64),
          failure: null,
          delta: {
            upserted: [{ ...baselineResource, amount: 2 }],
            deleted: [],
          },
        };
        yield* Effect.promise(() => recovered.receiveCommand(foreignFinal));
        const beforeConflict = yield* Effect.promise(readStorage);
        const forgedSubmission = {
          ...commandA,
          id: foreignFinal.id,
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
        };
        const finalOnly = yield* Effect.tryPromise({
          try: () => recovered.accept(forgedSubmission),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(finalOnly)) {
          throw new Error(
            'Expected a forged retained command identity to refuse',
          );
        }
        expect(Cause.squash(finalOnly.cause)).toMatchObject({
          code: 'session-staged-coordinate-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        const retainedForeign = (yield* Effect.promise(() =>
          db.select().from(serviceNodeCommands),
        )).find(row => row.id === foreignFinal.id)!;
        expect(
          readServiceFinalCommand(retainedForeign, retainedA.nodeId),
        ).toMatchObject(foreignFinal);
        const originalA = originalRows.find(
          row => row.sessionIndex === commandA.sessionIndex,
        )!;
        expect(
          readServiceNodeCommand(originalA, retainedA.nodeId, nodeDefinition),
        ).toMatchObject({
          ...commandA,
          id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
        });
        // Readers reject incoherent durable positions without mutating the real retained rows.
        for (const nodeIndex of [0, Number.MAX_SAFE_INTEGER + 1]) {
          for (const invalid of [
            {
              read: () =>
                readServiceNodeCommand(
                  { ...originalA, nodeIndex },
                  retainedA.nodeId,
                  nodeDefinition,
                ),
              code: 'node-command-input-missing',
            },
            {
              read: () =>
                readServiceFinalCommand(
                  { ...retainedForeign, nodeIndex },
                  retainedA.nodeId,
                ),
              code: 'node-command-final-missing',
            },
          ]) {
            const refused = yield* Effect.sync(() => invalid.read()).pipe(
              Effect.exit,
            );
            if (Exit.isSuccess(refused)) {
              throw new Error('Expected invalid retained position to refuse');
            }
            expect(Cause.squash(refused.cause)).toMatchObject({
              code: invalid.code,
            });
          }
        }
        for (const invalid of [
          {
            read: () =>
              readServiceNodeCommand(
                { ...originalA, failure: privateFailure },
                retainedA.nodeId,
                nodeDefinition,
              ),
            code: 'node-command-input-missing',
          },
          {
            read: () =>
              readServiceFinalCommand(
                { ...retainedForeign, pushIndex: 3 },
                retainedA.nodeId,
              ),
            code: 'node-command-final-missing',
          },
        ]) {
          const refused = yield* Effect.sync(() => invalid.read()).pipe(
            Effect.exit,
          );
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected mixed retained phases to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: invalid.code,
          });
        }
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        const conflict = yield* Effect.tryPromise({
          try: () =>
            recovered.receiveCommand({
              ...finalB,
              delta: {
                upserted: [{ ...baselineResource, amount: 999 }],
                deleted: [],
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(conflict)) {
          throw new Error('Expected changed immutable final data to refuse');
        }
        expect(Cause.squash(conflict.cause)).toMatchObject({
          code: 'node-outcome-conflict',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);

        // Authenticated repair keeps original allocations and reconstructs derived final evidence.
        const repairBaseline = {
          serviceIndex: 3,
          dispositionChainHash: '3'.repeat(64),
          resolvedThrough: 2,
          resources: [{ ...baselineResource, amount: 2 }],
        };
        const missingOriginal = yield* Effect.tryPromise({
          try: () =>
            recovered.repairConnectedBaseline({
              ...repairBaseline,
              resolvedThrough: 3,
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(missingOriginal)) {
          throw new Error(
            'Expected an incomplete original stream to refuse repair',
          );
        }
        expect(Cause.squash(missingOriginal.cause)).toMatchObject({
          code: 'node-command-input-missing',
        });
        expect(yield* Effect.promise(readStorage)).toEqual(beforeConflict);
        yield* Effect.promise(() => recovered.setPushPaused(true));
        let recoveryClaimed = false;
        recovered.setConnectedRecoveryHandler(() => {
          recoveryClaimed = true;
          return true;
        });
        yield* Effect.promise(() =>
          db
            .update(serviceNodeMetadata)
            .set({ dispositionChainHash: 'damaged' }),
        );
        const damagedSnapshot = yield* Effect.tryPromise({
          try: () => recovered.snapshot(),
          catch: error => error,
        }).pipe(Effect.exit);
        expect(Exit.isFailure(damagedSnapshot)).toBe(true);
        expect(recoveryClaimed).toBe(true);
        const pausedSubmission = yield* Effect.tryPromise({
          try: () => recovered.accept(commandA),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(pausedSubmission)) {
          throw new Error('Expected claimed recovery to fence submissions');
        }
        expect(Cause.squash(pausedSubmission.cause)).toMatchObject({
          code: 'node-staging-blocked',
        });
        const releaseRepair = yield* Effect.promise(() =>
          recovered.prepareReset(undefined, true),
        );
        expect(
          yield* Effect.promise(() =>
            recovered.readConnectedRecoveryIdentity(),
          ),
        ).toBe(retainedA.nodeId);
        yield* Effect.promise(() =>
          recovered.repairConnectedBaseline(repairBaseline),
        );
        expect(
          yield* Effect.promise(() => db.select().from(serviceNodeCommands)),
        ).toEqual(originalRows);
        yield* Effect.promise(() => recovered.receiveCommand(finalB));
        yield* Effect.promise(() =>
          recovered.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'record',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 999 }],
              deleted: [],
            },
          }),
        );
        yield* Effect.promise(() => releaseRepair(true));
        recovered.setConnectedRecoveryHandler(undefined);
        expect(yield* Effect.promise(() => recovered.accept(commandA))).toEqual(
          retainedA,
        );
        expect(
          yield* Effect.promise(() => recovered.snapshot({ pendingCommands })),
        ).toMatchObject({
          outcomeIndex: 2,
          metadata: {
            nodeId: retainedA.nodeId,
            serviceIndex: 3,
            admittedThroughPushIndex: 2,
            pushPaused: true,
          },
          resources: [{ amount: 2 }],
        });
        // Refused connected opens preserve history, producer identity, ledger and version.
        const mismatchedBinding = yield* openNode({
          ...nodeDefinition.identity,
          definitionHash: 'different-definition',
        });
        const readUpgradeState = () =>
          Promise.all([
            readStorage(),
            db.select().from(nodeMigrationLedger),
            db.values<[number]>(sql`PRAGMA user_version`),
          ]);
        const beforeRefusal = yield* Effect.promise(readUpgradeState);
        for (const invalid of [
          { node: mismatchedBinding, code: 'node-storage-identity-mismatch' },
          { node: recovered, code: 'node-storage-upgrade-schema-mismatch' },
        ]) {
          if (invalid.node === recovered) {
            yield* Effect.promise(() =>
              db.run(
                sql`CREATE INDEX unexpected_connected_storage ON commands (sessionIndex)`,
              ),
            );
          }
          const refused = yield* Effect.tryPromise({
            try: () => invalid.node.initializeConnectedStorage(false),
            catch: error => error,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Invalid connected storage must refuse');
          }
          const failure = Cause.squash(refused.cause);
          expect(failure).toMatchObject({ code: invalid.code });
          expect(shouldResetConnectedNode({ failure, attempted: false })).toBe(
            false,
          );
          expect(yield* Effect.promise(readUpgradeState)).toEqual(
            beforeRefusal,
          );
        }
        expect(
          yield* Effect.promise(() =>
            db.all<{ name: string }>(
              sql`SELECT name FROM sqlite_master WHERE name = 'unexpected_connected_storage'`,
            ),
          ),
        ).toEqual([{ name: 'unexpected_connected_storage' }]);
        yield* Effect.promise(() =>
          db.run(sql`DROP INDEX unexpected_connected_storage`),
        );
        yield* Effect.promise(() => mismatchedBinding.close());
      }),
  );
});

describe('Standalone authoritative execution controls', () => {
  it.effect(
    'retains paused originals and executes one manual command without unpausing',
    () =>
      Effect.gen(function* () {
        const record = makeAggregateContractRelease(
          defineAggregateContract('record'),
          {
            version: 1,
            payload: {},
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'paused' }),
          {
            version: 1,
            models: {},
            system: { record },
            actors: {},
          },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'standalone',
          aggregateName: release.name,
          aggregateVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'paused',
          models: release.models,
          contracts: release.contracts,
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
        });
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const context = yield* Effect.context<never>();
        const view = yield* Effect.promise(() =>
          makeAggregateNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const node = new AggregateNode(
          db,
          {
            identity: {
              apiUrl: '',
              publishableKey: '',
              systemName: 'standalone',
              aggregateName: release.name,
              aggregateVersion: 1,
              aggregateId: 'paused',
              actorName: 'member',
              actorVersion: 1,
              sessionName: 'paused',
              claims: { aggregateId: 'paused' },
              definitionHash: 'paused',
            },
            lock: makeAggregateSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
        yield* Effect.promise(() => node.initialize(true));
        yield* Effect.promise(() =>
          node.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [],
          }),
        );
        yield* Effect.promise(() => node.setPushPaused(true));
        for (const sessionIndex of [1, 2]) {
          yield* Effect.promise(() =>
            node.accept({
              id: null,
              nodeId: null,
              nodeIndex: null,
              pushIndex: null,
              sessionId: 'sesn_paused',
              sessionIndex,
              kind: 'actor',
              aggregateName: release.name,
              aggregateVersion: 1,
              aggregateId: 'paused',
              actorName: 'member',
              actorVersion: 1,
              sessionName: 'paused',
              commandName: 'record',
              contractVersion: 1,
              claims: { aggregateId: 'paused' },
              payload: '{}',
              stagingOutcome: {
                result: null,
                completedAt: '2026-10-27T00:00:00.000Z',
              },
            }),
          );
        }
        // The Node owns pause, generation fencing and final retention; this callback supplies a valid final.
        const execute = (manual = false, expectedNodeId?: string) =>
          executeStandaloneNext({
            node,
            manual,
            ...(expectedNodeId === undefined ? {} : { expectedNodeId }),
            execute: (command, checkpoint) => {
              if (checkpoint.aggregateIndex === null) {
                throw new Error('Expected initialized checkpoint');
              }
              const aggregateIndex = checkpoint.aggregateIndex + 1;
              return Effect.succeed({
                id: command.id,
                commandName: command.commandName,
                aggregateIndex,
                dispositionChainHash: aggregateIndex
                  .toString(16)
                  .padStart(64, '0'),
                delta: { upserted: [], deleted: [] },
                failure: null,
              });
            },
          });
        const before = yield* Effect.promise(() => node.snapshot());
        expect(yield* execute()).toBe(false);
        expect(
          (yield* Effect.promise(() => node.snapshot())).metadata
            .aggregateIndex,
        ).toBe(0);
        expect(yield* execute(true, before.metadata.nodeId)).toBe(true);
        const manual = yield* Effect.promise(() => node.snapshot());
        expect(manual.metadata.aggregateIndex).toBe(1);
        expect(manual.metadata.pushPaused).toBe(true);
        const stale = yield* execute(true, 'node_retired').pipe(Effect.exit);
        expect(Exit.isFailure(stale)).toBe(true);
        if (Exit.isFailure(stale)) {
          expect(Cause.squash(stale.cause)).toMatchObject({
            code: 'standalone-capability-stale',
          });
        }
        expect(
          (yield* Effect.promise(() => node.snapshot())).metadata
            .aggregateIndex,
        ).toBe(1);
        yield* Effect.promise(() => node.setPushPaused(false));
        expect(yield* execute()).toBe(true);
        const complete = yield* Effect.promise(() => node.snapshot());
        expect(complete.metadata.aggregateIndex).toBe(2);
        expect(complete.nodeIndex).toBe(4);
      }),
  );

  it.effect(
    'discards unreadable standalone state only when opted in and only once per owner',
    () =>
      Effect.gen(function* () {
        const definition = makeAggregateSessionDefinition({
          systemName: 'standalone',
          aggregateName: 'draft',
          aggregateVersion: 1,
          actorName: 'guest',
          actorVersion: 1,
          sessionName: 'draft',
          models,
          contracts: {},
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
        });
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const request = {
          sessionName: 'draft',
          pattern: '/draft',
          path: '/draft',
          claims: { aggregateId: 'draft' },
          resources: [
            Schema.encodeSync(counterV1.resourceJsonCodec)(baselineResource),
          ],
        };
        const sessionKey = yield* Effect.promise(() =>
          standaloneStorageKey(definition, request.path),
        );
        const makeRuntime = () =>
          makeStandaloneWorkerRuntime({
            sessionKey,
            execution: { sessionDefinition: definition },
            ownership: Promise.resolve(),
            openMemory,
            openStorage: async () => ({
              db,
              withRelations: db.withRelations,
              close: async () => {},
            }),
          });
        const original = makeRuntime();
        const before = yield* Effect.promise(() => original.attach(request));
        yield* Effect.promise(() => original.stop());
        yield* Effect.promise(() => original.closeStorage());
        yield* Effect.promise(() =>
          db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: 'broken' }),
        );
        const restored = makeRuntime();
        const notice = vi.fn(async () => {});
        const unsubscribeNotice = restored.subscribeRecoveryNotices(notice);
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            unsubscribeNotice();
            await restored.stop();
            await restored.closeStorage();
          }),
        );
        const retained = yield* Effect.promise(() =>
          restored.attach(request),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(retained)).toBe(true);
        if (Exit.isFailure(retained)) {
          expect(Cause.squash(retained.cause)).toMatchObject({
            code: 'node-execution-checkpoint-invalid',
          });
        }
        expect(notice).not.toHaveBeenCalled();
        const failedReplacement = makeRuntime();
        const failedNotice = vi.fn(async () => {});
        failedReplacement.subscribeRecoveryNotices(failedNotice);
        const resetFailure = vi
          .spyOn(AggregateNode.prototype, 'reset')
          .mockRejectedValueOnce(new Error('replacement write failed'));
        try {
          const failed = yield* Effect.promise(() =>
            failedReplacement.attach({ ...request, discardUnrestorable: true }),
          ).pipe(Effect.exit);
          expect(Exit.isFailure(failed)).toBe(true);
          expect(failedNotice).not.toHaveBeenCalled();
        } finally {
          resetFailure.mockRestore();
          yield* Effect.promise(async () => {
            await failedReplacement.stop();
            await failedReplacement.closeStorage();
          });
        }
        const recovered = yield* Effect.promise(() =>
          restored.attach({ ...request, discardUnrestorable: true }),
        );
        expect(recovered.boundNodeId).not.toBe(before.boundNodeId);
        const snapshot = yield* Effect.promise(() => recovered.node.snapshot());
        expect(snapshot.metadata.aggregateIndex).toBe(0);
        expect(snapshot.resources).toEqual([baselineResource]);
        expect(notice).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            code: 'standalone-state-reset',
            message:
              'Your saved local document could not be restored and was reset to its initial state.',
          }),
        );
        yield* Effect.promise(() =>
          db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: 'broken-again' }),
        );
        const exhausted = yield* Effect.promise(() =>
          restored.attach({ ...request, discardUnrestorable: true }),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(exhausted)).toBe(true);
        expect(notice).toHaveBeenCalledOnce();
        expect(
          (yield* Effect.promise(() =>
            db.select().from(aggregateNodeMetadata),
          ))[0]?.dispositionChainHash,
        ).toBe('broken-again');
      }),
  );

  it.effect(
    'recovers corrupt retained command inputs without discarding authored projection failures',
    () =>
      Effect.gen(function* () {
        let failProjection = false;
        const record = makeAggregateContractRelease(
          defineAggregateContract('record'),
          {
            version: 1,
            payload: {},
            result: Schema.Null,
            program: () =>
              failProjection
                ? Effect.die(makeZerospinError('node-command-input-missing'))
                : Effect.succeed(null),
          },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'standalone',
          aggregateName: 'draft',
          aggregateVersion: 1,
          actorName: 'guest',
          actorVersion: 1,
          sessionName: 'draft',
          models,
          contracts: { record },
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
        });
        const request = {
          sessionName: 'draft',
          pattern: '/draft',
          path: '/draft',
          claims: { aggregateId: 'draft' },
          resources: [
            Schema.encodeSync(counterV1.resourceJsonCodec)(baselineResource),
          ],
        };
        const sessionKey = yield* Effect.promise(() =>
          standaloneStorageKey(definition, request.path),
        );
        for (const corruption of ['payload', 'commandName', 'projection']) {
          failProjection = false;
          const storage = yield* openTestDb({});
          const db = nodeDb(storage.db.$client);
          const makeRuntime = () =>
            makeStandaloneWorkerRuntime({
              sessionKey,
              execution: { sessionDefinition: definition },
              ownership: Promise.resolve(),
              openMemory,
              openStorage: async () => ({
                db,
                withRelations: db.withRelations,
                close: async () => {},
              }),
            });
          const original = makeRuntime();
          const attachment = yield* Effect.promise(() =>
            original.attach(request),
          );
          yield* Effect.promise(() => attachment.node.setPushPaused(true));
          yield* original.drainProgram();
          yield* Effect.promise(() =>
            attachment.node.accept({
              id: null,
              nodeId: null,
              nodeIndex: null,
              pushIndex: null,
              sessionId: 'sesn_corrupt',
              sessionIndex: 1,
              kind: 'actor',
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              aggregateId: 'draft',
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              commandName: record.commandName,
              contractVersion: record.version,
              claims: request.claims,
              payload: '{}',
              stagingOutcome: {
                result: null,
                completedAt: '2026-11-02T00:00:00.000Z',
              },
            }),
          );
          if (corruption !== 'projection') {
            // Resolved originals remain retained and must still be audited.
            yield* original.pushProgram(attachment.boundNodeId);
          }
          yield* Effect.promise(async () => {
            await original.stop();
            await original.closeStorage();
            if (corruption === 'projection') {
              failProjection = true;
            } else {
              await db
                .update(aggregateNodeCommands)
                .set(
                  corruption === 'payload'
                    ? { payload: null }
                    : { commandName: 'unknown' },
                )
                .where(isNotNull(aggregateNodeCommands.pushIndex));
            }
          });
          const retained = yield* Effect.promise(() =>
            db.select().from(aggregateNodeCommands),
          );
          const restored = makeRuntime();
          const notice = vi.fn(async () => {});
          restored.subscribeRecoveryNotices(notice);
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              await restored.stop();
              await restored.closeStorage();
            }),
          );
          const preserved = yield* Effect.promise(() =>
            restored.attach(request),
          ).pipe(Effect.exit);
          expect(Exit.isFailure(preserved)).toBe(true);
          if (Exit.isFailure(preserved)) {
            expect(Cause.squash(preserved.cause)).toMatchObject({
              code:
                corruption === 'projection'
                  ? 'node-optimistic-view-failed'
                  : corruption === 'payload'
                    ? 'node-command-input-missing'
                    : 'node-command-contract-mismatch',
            });
          }
          expect(notice).not.toHaveBeenCalled();
          const recovery = yield* Effect.promise(() =>
            restored.attach({ ...request, discardUnrestorable: true }),
          ).pipe(Effect.exit);
          if (corruption === 'projection') {
            expect(Exit.isFailure(recovery)).toBe(true);
            if (Exit.isFailure(recovery)) {
              expect(Cause.squash(recovery.cause)).toMatchObject({
                code: 'node-optimistic-view-failed',
              });
            }
            expect(notice).not.toHaveBeenCalled();
            expect(
              yield* Effect.promise(() =>
                db.select().from(aggregateNodeCommands),
              ),
            ).toEqual(retained);
          } else {
            expect(Exit.isSuccess(recovery)).toBe(true);
            if (Exit.isSuccess(recovery)) {
              expect(recovery.value.boundNodeId).not.toBe(
                attachment.boundNodeId,
              );
              const snapshot = yield* Effect.promise(() =>
                recovery.value.node.snapshot(),
              );
              expect(snapshot.resources).toEqual([baselineResource]);
            }
            expect(notice).toHaveBeenCalledExactlyOnceWith(
              expect.objectContaining({
                code: 'standalone-state-reset',
                message:
                  'Your saved local document could not be restored and was reset to its initial state.',
              }),
            );
          }
        }
      }),
  );

  it.effect(
    'recovers corrupt retained finals before cold or warm attachment subscriptions',
    () =>
      Effect.gen(function* () {
        for (const warm of [false, true]) {
          const storage = yield* openTestDb({});
          const db = nodeDb(storage.db.$client);
          const request = {
            sessionName: gameSessionDefinition.sessionName,
            pattern: '/games/:aggregateId',
            path: '/games/standalone',
            claims: {
              aggregateId: 'standalone',
              instanceId: 'gam_retained_final',
            },
          };
          const makeRuntime = () =>
            makeStandaloneWorkerRuntime({
              sessionKey,
              execution: { sessionDefinition: gameSessionDefinition },
              ownership: Promise.resolve(),
              openMemory,
              openStorage: async () => ({
                db,
                withRelations: db.withRelations,
                close: async () => {},
              }),
            });
          const sessionKey = yield* Effect.promise(() =>
            standaloneStorageKey(gameSessionDefinition, request.path),
          );
          const original = makeRuntime();
          const notice = vi.fn(async () => {});
          original.subscribeRecoveryNotices(notice);
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              await original.stop();
              await original.closeStorage();
            }),
          );
          const attachment = yield* Effect.promise(() =>
            original.attach(request),
          );
          yield* Effect.promise(() => attachment.node.setPushPaused(true));
          yield* original.drainProgram();
          const command = Schema.decodeUnknownSync(AggregateNodeCommandSchema)({
            id: null,
            nodeId: null,
            nodeIndex: null,
            pushIndex: null,
            sessionId: 'sesn_retained_final',
            sessionIndex: 1,
            kind: 'actor',
            aggregateName: gameSessionDefinition.aggregateName,
            aggregateVersion: gameSessionDefinition.aggregateVersion,
            aggregateId: 'standalone',
            actorName: gameSessionDefinition.actorName,
            actorVersion: gameSessionDefinition.actorVersion,
            sessionName: gameSessionDefinition.sessionName,
            commandName: 'createGame',
            contractVersion: 1,
            claims: request.claims,
            payload: '{"id":"gam_retained_final"}',
            stagingOutcome: {
              result: null,
              completedAt: '2026-11-02T00:00:00.000Z',
            },
          });
          const retained = yield* Effect.promise(() =>
            attachment.node.accept(command),
          );
          const pending = {
            ...command,
            ...retained,
            id: makeNodeCommandId(retained.nodeId, retained.pushIndex),
          };
          expect(yield* original.pushProgram(attachment.boundNodeId)).toEqual({
            status: 'pushed',
          });
          const healthy = yield* Effect.promise(() =>
            original.attach({ ...request, discardUnrestorable: true }),
          );
          expect(healthy.boundNodeId).toBe(attachment.boundNodeId);
          expect(notice).not.toHaveBeenCalled();
          let pendingCommands = [pending];
          if (warm) {
            // The live browser has retained coordinates until destructive reset is acknowledged.
            const api = new StandaloneBrowserSessionApi(
              healthy,
              original.drainProgram,
              original.pushProgram,
              () => {},
            );
            const sink = new RpcStub({
              view: async () => {},
              state: async () => {},
              reset: async (options?: { preservePending?: boolean }) => {
                if (options?.preservePending !== true) pendingCommands = [];
              },
            });
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                api[Symbol.dispose]();
                sink[Symbol.dispose]();
              }),
            );
            yield* Effect.promise(() =>
              api.subscribe({ pendingCommands }, sink),
            );
          } else {
            // A new cold facade has no in-memory pending rows from the retired page.
            pendingCommands = [];
            yield* Effect.promise(async () => {
              await original.stop();
              await original.closeStorage();
            });
          }
          yield* Effect.promise(() =>
            db
              .update(aggregateNodeCommands)
              .set({ exposedDelta: null })
              .where(isNotNull(aggregateNodeCommands.aggregateIndex)),
          );
          const damaged = yield* Effect.promise(() =>
            db.select().from(aggregateNodeCommands),
          );
          const restored = warm ? original : makeRuntime();
          if (!warm) restored.subscribeRecoveryNotices(notice);
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              await restored.stop();
              await restored.closeStorage();
            }),
          );
          const preserved = yield* Effect.promise(() =>
            restored.attach(request),
          ).pipe(Effect.exit);
          expect(Exit.isFailure(preserved)).toBe(true);
          if (Exit.isFailure(preserved)) {
            expect(Cause.squash(preserved.cause)).toMatchObject({
              code: 'node-command-final-missing',
            });
          }
          expect(
            yield* Effect.promise(() =>
              db.select().from(aggregateNodeCommands),
            ),
          ).toEqual(damaged);
          expect(notice).not.toHaveBeenCalled();
          const recovered = yield* Effect.promise(() =>
            restored.attach({ ...request, discardUnrestorable: true }),
          );
          expect(recovered.boundNodeId).not.toBe(attachment.boundNodeId);
          expect(notice).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
              code: 'standalone-state-reset',
              message:
                'Your saved local document could not be restored and was reset to its initial state.',
            }),
          );
          expect(pendingCommands).toEqual([]);
          const api = new StandaloneBrowserSessionApi(
            recovered,
            restored.drainProgram,
            restored.pushProgram,
            () => {},
          );
          const view = vi.fn(async () => {});
          const sink = new RpcStub({
            view,
            state: async () => {},
            reset: async () => {},
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              api[Symbol.dispose]();
              sink[Symbol.dispose]();
            }),
          );
          yield* Effect.promise(() => api.subscribe({ pendingCommands }, sink));
          expect(view).toHaveBeenCalledWith(
            expect.objectContaining({
              metadata: expect.objectContaining({
                nodeId: recovered.boundNodeId,
              }),
              resources: [],
              commandCoverage: [],
            }),
          );
        }
      }),
  );

  it.effect(
    'rechecks a shared standalone document after fencing and preserves identity or environment failures',
    () =>
      Effect.gen(function* () {
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const request = {
          sessionName: gameSessionDefinition.sessionName,
          pattern: '/games/:aggregateId',
          path: '/games/standalone',
          claims: { aggregateId: 'standalone', instanceId: 'gam_attachment_a' },
          discardUnrestorable: true,
        };
        const sessionKey = yield* Effect.promise(() =>
          standaloneStorageKey(gameSessionDefinition, request.path),
        );
        const runtime = makeStandaloneWorkerRuntime({
          sessionKey,
          execution: { sessionDefinition: gameSessionDefinition },
          ownership: Promise.resolve(),
          openMemory,
          openStorage: async () => ({
            db,
            withRelations: db.withRelations,
            close: async () => {},
          }),
        });
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await runtime.stop();
            await runtime.closeStorage();
          }),
        );
        const current = yield* Effect.promise(() => runtime.attach(request));
        const notice = vi.fn(async () => {});
        runtime.subscribeRecoveryNotices(notice);
        const metadata = (yield* Effect.promise(() => current.node.snapshot()))
          .metadata;
        const repair = vi.fn(async () => {
          await db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: metadata.dispositionChainHash });
        });
        const restoredView = Promise.withResolvers<void>();
        const api = new StandaloneBrowserSessionApi(
          current,
          () => runtime.drainProgram(),
          nodeId => runtime.pushProgram(nodeId),
          () => {},
        );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => api[Symbol.dispose]()),
        );
        yield* Effect.promise(() =>
          api.subscribe(
            {},
            new RpcStub({
              view: async () => {
                if (repair.mock.calls.length > 0) restoredView.resolve();
              },
              state: async () => {},
              reset: repair,
            }),
          ),
        );
        yield* Effect.promise(() =>
          db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: 'broken' }),
        );
        const repaired = yield* Effect.promise(() => runtime.attach(request));
        expect(repair).toHaveBeenCalledOnce();
        expect(repair).toHaveBeenCalledWith(
          expect.objectContaining({ preservePending: true }),
        );
        expect(repaired.boundNodeId).toBe(current.boundNodeId);
        expect(notice).not.toHaveBeenCalled();
        // Join real background work before injecting SQL corruption outside the Node gate.
        yield* Effect.promise(() => restoredView.promise);
        yield* runtime.drainProgram();
        yield* Effect.promise(() => current.node.snapshot());
        yield* Effect.promise(() =>
          db.update(aggregateNodeMetadata).set({
            aggregateId: 'another-account',
            dispositionChainHash: 'broken',
          }),
        );
        expect(
          (yield* Effect.promise(() =>
            db.select().from(aggregateNodeMetadata),
          ))[0]?.aggregateId,
        ).toBe('another-account');
        const foreign = yield* Effect.promise(() =>
          runtime.attach(request),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(foreign)).toBe(true);
        if (Exit.isFailure(foreign)) {
          expect(Cause.squash(foreign.cause)).toMatchObject({
            code: 'standalone-storage-identity-mismatch',
          });
        }
        expect(repair).toHaveBeenCalledOnce();
        expect(notice).not.toHaveBeenCalled();
        expect(
          (yield* Effect.promise(() =>
            db.select().from(aggregateNodeMetadata),
          ))[0]?.aggregateId,
        ).toBe('another-account');
        const unavailable = vi.fn(async (): Promise<never> => {
          throw makeZerospinError('node-storage-runtime-unavailable');
        });
        const unavailableRuntime = makeStandaloneWorkerRuntime({
          sessionKey,
          execution: { sessionDefinition: gameSessionDefinition },
          ownership: Promise.resolve(),
          openMemory,
          openStorage: unavailable,
        });
        const failed = yield* Effect.promise(() =>
          unavailableRuntime.attach(request),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(failed)).toBe(true);
        expect(unavailable).toHaveBeenCalledOnce();
        yield* Effect.promise(() => unavailableRuntime.stop());
        yield* Effect.promise(() => unavailableRuntime.closeStorage());
      }),
  );

  it.effect(
    'notifies each live standalone port once across reattachment without waiting for recipients',
    () =>
      Effect.gen(function* () {
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const request = {
          sessionName: gameSessionDefinition.sessionName,
          pattern: '/games/:aggregateId',
          path: '/games/standalone',
          claims: { aggregateId: 'standalone', instanceId: 'gam_attachment_a' },
          discardUnrestorable: true,
        };
        const runtime = makeStandaloneWorkerRuntime({
          sessionKey: yield* Effect.promise(() =>
            standaloneStorageKey(gameSessionDefinition, request.path),
          ),
          execution: { sessionDefinition: gameSessionDefinition },
          ownership: Promise.resolve(),
          openMemory,
          openStorage: async () => ({
            db,
            withRelations: db.withRelations,
            close: async () => {},
          }),
        });
        const notices = [
          vi.fn(async () => {}),
          vi.fn(async () => {}),
          vi.fn(async () => {
            throw new Error('notification handler failed');
          }),
          vi.fn(() => new Promise<void>(() => {})),
        ];
        const clients = notices.map(notice => ({
          notice,
          callback: new RpcStub(notice),
          api: new StandaloneSharedWorkerApi(
            runtime.attach,
            runtime.drainProgram,
            runtime.pushProgram,
            Promise.resolve(),
            runtime.subscribeRecoveryNotices,
          ),
        }));
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            for (const client of clients) {
              client.api[Symbol.dispose]();
              client.callback[Symbol.dispose]();
            }
            await runtime.stop();
            await runtime.closeStorage();
          }),
        );
        for (const client of clients) {
          const retired = yield* Effect.promise(() =>
            client.api.attach(request, client.callback),
          );
          retired[Symbol.dispose]();
          yield* Effect.promise(() =>
            client.api.attach(request, client.callback),
          );
        }
        // A closed port must leave the recipient set; retired sessions do not.
        for (const client of clients.slice(0, 1)) {
          client.api[Symbol.dispose]();
          client.callback[Symbol.dispose]();
        }
        yield* runtime.drainProgram();
        const before = yield* Effect.promise(() => runtime.attach(request));
        yield* Effect.promise(() => before.node.snapshot());
        yield* Effect.promise(() =>
          db
            .update(aggregateNodeMetadata)
            .set({ dispositionChainHash: 'broken' }),
        );
        const replaced = yield* Effect.promise(() => runtime.attach(request));
        expect(replaced.boundNodeId).not.toBe(before.boundNodeId);
        yield* Effect.promise(() =>
          expect
            .poll(() => notices.map(notice => notice.mock.calls.length))
            .toEqual([0, 1, 1, 1]),
        );
        for (const client of clients.slice(1)) {
          expect(client.notice).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ code: 'standalone-state-reset' }),
          );
        }
        const late = vi.fn(async () => {});
        const unsubscribe = runtime.subscribeRecoveryNotices(late);
        yield* Effect.promise(() => runtime.attach(request));
        yield* Effect.promise(() =>
          runtime.attach({ ...request, reset: true }),
        );
        unsubscribe();
        expect(late).not.toHaveBeenCalled();
        for (const client of clients.slice(1)) {
          expect(client.notice).toHaveBeenCalledOnce();
        }
      }),
  );

  it.effect(
    'reports a successful incompatible standalone storage replacement after validation',
    () =>
      Effect.gen(function* () {
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const request = {
          sessionName: gameSessionDefinition.sessionName,
          pattern: '/games/:aggregateId',
          path: '/games/standalone',
          claims: { aggregateId: 'standalone', instanceId: 'gam_attachment_a' },
        };
        const sessionKey = yield* Effect.promise(() =>
          standaloneStorageKey(gameSessionDefinition, request.path),
        );
        const makeRuntime = () =>
          makeStandaloneWorkerRuntime({
            sessionKey,
            execution: { sessionDefinition: gameSessionDefinition },
            ownership: Promise.resolve(),
            openMemory,
            openStorage: async () => ({
              db,
              withRelations: db.withRelations,
              close: async () => {},
            }),
          });
        const original = makeRuntime();
        yield* Effect.promise(() => original.attach(request));
        yield* Effect.promise(async () => {
          await original.stop();
          await original.closeStorage();
          await db.run(sql`PRAGMA user_version = 0`);
        });
        const restored = makeRuntime();
        const notice = vi.fn(async () => {});
        restored.subscribeRecoveryNotices(notice);
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await restored.stop();
            await restored.closeStorage();
          }),
        );
        const attached = yield* Effect.promise(() => restored.attach(request));
        const snapshot = yield* Effect.promise(() => attached.node.snapshot());
        expect(snapshot.metadata.aggregateIndex).toBe(0);
        expect(notice).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ code: 'standalone-state-reset' }),
        );
      }),
  );

  it.effect(
    'executes recovered original claims and leaves empty stale subscriber pages inert',
    () =>
      Effect.gen(function* () {
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const request = {
          sessionName: gameSessionDefinition.sessionName,
          pattern: '/games/:aggregateId',
          path: '/games/standalone',
          claims: { aggregateId: 'standalone', instanceId: 'gam_attachment_a' },
        };
        const runtime = makeStandaloneWorkerRuntime({
          sessionKey: yield* Effect.promise(() =>
            standaloneStorageKey(gameSessionDefinition, request.path),
          ),
          execution: { sessionDefinition: gameSessionDefinition },
          ownership: Promise.resolve(),
          openMemory,
          openStorage: async () => ({
            db,
            withRelations: db.withRelations,
            // The existing openTestDb Scope owns this in-memory SQLite client.
            close: async () => {},
          }),
        });
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await runtime.stop();
            await runtime.closeStorage();
          }),
        );
        const attachment = yield* Effect.promise(() => runtime.attach(request));
        const drain = vi.fn(() => runtime.drainProgram());
        const api = new StandaloneBrowserSessionApi(
          attachment,
          drain,
          expectedNodeId => runtime.pushProgram(expectedNodeId),
          () => {},
        );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => api[Symbol.dispose]()),
        );
        const subscriber = api.getStagedCommandSubscriber(
          attachment.boundNodeId,
        );
        const accept = vi.spyOn(attachment.node, 'accept');
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => accept.mockRestore()),
        );
        expect(
          yield* Effect.promise(() => subscriber.receive([])).pipe(
            Effect.flatMap(readRpcEnvelope),
          ),
        ).toEqual([]);
        expect(accept).not.toHaveBeenCalled();
        expect(drain).not.toHaveBeenCalled();

        yield* Effect.promise(() => attachment.node.setPushPaused(true));
        const original = Schema.decodeUnknownSync(AggregateNodeCommandSchema)({
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_original_b',
          sessionIndex: 1,
          kind: 'actor',
          aggregateName: gameSessionDefinition.aggregateName,
          aggregateVersion: gameSessionDefinition.aggregateVersion,
          aggregateId: 'standalone',
          actorName: gameSessionDefinition.actorName,
          actorVersion: gameSessionDefinition.actorVersion,
          sessionName: gameSessionDefinition.sessionName,
          commandName: 'createGame',
          contractVersion: 1,
          claims: { aggregateId: 'standalone', instanceId: 'gam_original_b' },
          payload: '{"id":"gam_original_b"}',
          stagingOutcome: {
            result: null,
            completedAt: '2026-10-27T00:00:00.000Z',
          },
        });
        const retained = yield* Effect.promise(() =>
          subscriber.receive([original]),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        expect(retained).toEqual([
          {
            sessionId: original.sessionId,
            sessionIndex: original.sessionIndex,
            nodeId: attachment.boundNodeId,
            nodeIndex: 1,
            pushIndex: 1,
          },
        ]);
        yield* runtime.drainProgram();
        const before = yield* Effect.promise(() =>
          db.select().from(aggregateNodeCommands),
        );
        expect(before).toHaveLength(1);
        expect(
          readAggregateNodeCommand(
            before[0]!,
            attachment.boundNodeId,
            attachment.node.definition,
          ).claims,
        ).toEqual(original.claims);
        expect(
          yield* Effect.promise(() => db.select().from(game.drizzleSchema)),
        ).toEqual([]);
        const invalid = yield* Effect.promise(() =>
          subscriber.receive([
            {
              ...original,
              sessionIndex: 2,
              claims: { ...original.claims, aggregateId: 'another-owner' },
            },
          ]),
        );
        expect(invalid.result).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'node-command-identity-mismatch' },
        });
        expect(
          yield* Effect.promise(() => db.select().from(aggregateNodeCommands)),
        ).toEqual(before);
        expect(
          yield* Effect.promise(() => db.select().from(game.drizzleSchema)),
        ).toEqual([]);

        // This uses the actual Standalone runtime, Node transaction and released
        // createGame executor. Replacing B's claims with A's would fail its guard.
        expect(yield* runtime.pushProgram(attachment.boundNodeId)).toEqual({
          status: 'pushed',
        });
        expect(
          yield* Effect.promise(() => db.select().from(game.drizzleSchema)),
        ).toMatchObject([{ id: 'gam_original_b', board: '.........' }]);
        const executed = yield* Effect.promise(() =>
          attachment.node.snapshot(),
        );
        expect(executed.metadata.aggregateIndex).toBe(1);
        expect(attachment.claims).toEqual(request.claims);

        const replacement = yield* Effect.promise(() =>
          runtime.attach({ ...request, reset: true }),
        );
        expect(replacement.boundNodeId).not.toBe(attachment.boundNodeId);
        accept.mockClear();
        drain.mockClear();
        expect(
          yield* Effect.promise(() => subscriber.receive([])).pipe(
            Effect.flatMap(readRpcEnvelope),
          ),
        ).toEqual([]);
        expect(accept).not.toHaveBeenCalled();
        expect(drain).not.toHaveBeenCalled();
        const stale = yield* Effect.promise(() =>
          subscriber.receive([original]),
        );
        expect(stale.result).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'standalone-capability-stale' },
        });
        expect(drain).not.toHaveBeenCalled();
        expect(
          yield* Effect.promise(() => db.select().from(aggregateNodeCommands)),
        ).toEqual([]);
      }),
  );
});
