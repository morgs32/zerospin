import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

import { describe, expect, it } from '@effect/vitest';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import { makeConnectedAggregateConnection } from '@zerospin/browser/AggregateNode/makeConnectedAggregateConnection';
import * as workerPorts from '@zerospin/browser/Node/acquireWorkerPort';
import { makeOutboxSubscriber } from '@zerospin/browser/outbox/makeOutboxSubscriber';
import { makeSessionCommandHandoff } from '@zerospin/browser/outbox/makeSessionCommandHandoff';
import { makeConnectedServiceConnection } from '@zerospin/browser/ServiceNode/makeConnectedServiceConnection';
import type { IAggregateReplica } from '@zerospin/browser/sessionReplica/replicaConnection';
import { makeStandaloneAggregateConnection } from '@zerospin/browser/StandaloneNode/makeStandaloneAggregateConnection';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import { SessionSubmissionSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { installAggregateNodeView } from '@zerospin/core/aggregateSession/installAggregateNodeView';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import { stageAggregateSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx';
import * as operationApplication from '@zerospin/core/contracts/applyOperationTx';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { compileSqliteTableDefinition } from '@zerospin/core/drizzle/definition/compileSqliteTableDefinition';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type {
  ISqliteClient,
  ISqliteStatementParameter,
} from '@zerospin/core/drizzle/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { rebuildConnectedReadTablesTx } from '@zerospin/core/Node/rebuildConnectedReadTables';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceNodeOptimisticView } from '@zerospin/core/ServiceNode/makeServiceNodeOptimisticView';
import { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from '@zerospin/core/ServiceNode/serviceNodeTables';
import { installServiceNodeView } from '@zerospin/core/serviceSession/installServiceNodeView';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { makeZerospinError } from '@zerospin/error';
import { CuidFactory, primitives, type IAnyTables } from '@zerospin/shapes';
import { eq, sql } from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

import { catalogSessionDefinition } from '../../../examples/shopping/src/zerospin/catalogSessionDefinition.ts';
import { gameSessionDefinition } from '../../../examples/tic-tac-toe/src/gameSessionDefinition.ts';
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
const genesisHash = '0'.repeat(64);
const finalHash = '1'.repeat(64);
const baselineResource = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_shared',
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
  amount: 0,
};

/** Adapt the existing synchronous SQLite client to the Node's async Drizzle owner. */
function nodeDb(client: ISqliteClient) {
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

  return drizzle(
    {
      all: execute,
      get,
      run: async (query, parameters) => {
        await execute(query, parameters);
      },
    },
    { codecs: durableSQLiteCodecs },
  );
}

/** Own replica provisioning; the scenario owns all staged commands and observations. */
function openReplica<TABLES extends IAnyTables>(tables: TABLES) {
  return Effect.gen(function* () {
    const opened = yield* openTestDb(models);
    const config = makeResourceDbConfig({ models, otherTables: tables });
    const db = makeSqliteDrizzle(opened.db.$client, config);
    yield* provisionDb({ db, definition: config.definition });
    return db;
  });
}

describe('Node view recovery after a lost retention reply', () => {
  it.effect(
    'moves a named read index between two tables on offline reopen',
    () =>
      Effect.gen(function* () {
        const storage = yield* openTestDb({});
        const db = nodeDb(storage.db.$client);
        const index = {
          name: 'by_amount',
          columns: ['amount'] as const,
          unique: false,
        };
        const declare = (indexOwner: 'counter' | 'archive') => {
          const model = (
            name: 'counter' | 'archive',
            abbreviation: 'cnt' | 'arc',
          ) =>
            makeModelVersion(defineModel({ name, abbreviation }), {
              version: 1,
              attributes: { amount: primitives.integer() },
              indexes: name === indexOwner ? [index] : [],
            });
          const counter = model('counter', 'cnt');
          const archive = model('archive', 'arc');
          const tables = {
            counter: counter.drizzleSchema,
            archive: archive.drizzleSchema,
          };
          return {
            db,
            models: { counter, archive },
            tables,
            definitions: Object.values(tables).map(table =>
              compileSqliteTableDefinition(table),
            ),
            nodeId: 'producer',
            positionColumn: 'aggregateIndex' as const,
            position: 0,
            dispositionChainHash: genesisHash,
            readOriginalProgress: async () => ({
              pushIndex: 0,
              outcomeIndex: 0,
            }),
            readResources: async () => [],
          };
        };
        yield* Effect.promise(() =>
          db.run(
            sql.raw(
              compileSqliteTableDefinition(aggregateNodeCommands).createTable,
            ),
          ),
        );
        yield* Effect.promise(() =>
          db.transaction(() =>
            rebuildConnectedReadTablesTx({
              ...declare('archive'),
              fresh: {
                position: 0,
                dispositionChainHash: genesisHash,
                resolvedThrough: 0,
                resources: [baselineResource],
              },
            }),
          ),
        );
        yield* Effect.promise(() =>
          db.transaction(() =>
            rebuildConnectedReadTablesTx(declare('counter')),
          ),
        );
        expect(
          yield* Effect.promise(() =>
            db.values(
              sql`SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'by_amount'`,
            ),
          ),
        ).toEqual([['counter']]);
        expect(
          yield* Effect.promise(() =>
            db.values(sql`SELECT id, amount FROM counter`),
          ),
        ).toEqual([['cnt_shared', 0]]);
      }),
  );

  it.effect(
    'aggregate preserves recovery through refusals, replay rollback and projection failure',
    () =>
      Effect.gen(function* () {
        const increment = makeAggregateContractRelease(
          defineAggregateContract('increment'),
          {
            version: 1,
            payload: {},
            result: Schema.Number,
            models: {
              counter: {
                model: models.counter,
                fields: ['createdAt', 'updatedAt', 'amount'],
              },
            },
            operations: { update: counterV1.operations.update },
            program: Effect.fn('aggregateIncrement.program')(function* ({
              db,
              operations,
            }) {
              const row = yield* findFirst({
                db,
                model: db.models.counter,
                where: { id: { eq: 'cnt_shared' } },
              });
              if (row === undefined) throw new Error('Missing seeded counter');
              yield* operations.update({
                resourceId: row.id,
                attributes: { amount: row.amount + 1 },
              });
              return row.amount + 1;
            }),
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'recovery' }),
          { version: 1, models, system: { increment }, actors: {} },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'recovery',
          aggregateName: release.name,
          aggregateVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'counter',
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        const context = yield* Effect.context<never>();
        const view = yield* Effect.promise(() =>
          makeAggregateNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const node = new AggregateNode(
          nodeDb(storage.db.$client),
          {
            identity: {
              apiUrl: 'https://recovery.example',
              publishableKey: 'pub_recovery',
              systemName: definition.systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              aggregateId: 'recovery',
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { aggregateId: 'recovery' },
              definitionHash: 'recovery',
            },
            lock: makeAggregateSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
        yield* Effect.promise(() => node.initializeConnectedStorage());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const origin = yield* openReplica(aggregateSessionRepoDbConfig.tables);
        const observer = yield* openReplica(
          aggregateSessionRepoDbConfig.tables,
        );
        const sessionId = 'sesn_origin' as const;
        const initial = yield* Effect.promise(() => node.snapshot());
        yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: initial,
          sessionId,
        });
        yield* installAggregateNodeView({
          db: observer,
          definition,
          snapshot: initial,
          sessionId: 'sesn_observer',
        });
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition: definition,
          db: origin,
          admitted: {
            sessionId,
            aggregateId: 'recovery',
            actorName: 'member',
            actorVersion: 1,
            claims: { aggregateId: 'recovery' },
          },
        });
        const stagedA = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'increment',
          contract: increment,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('a')));
        const commandA = Schema.decodeUnknownSync(AggregateNodeCommandSchema)({
          ...Schema.encodeSync(SessionSubmissionSchema)(
            yield* encodeCommand({ contract: increment, command: stagedA }),
          ),
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        });
        const originalA = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .get()!;
        expect(originalA).toMatchObject({
          sessionIndex: 1,
          nodeId: null,
          nodeIndex: null,
          aggregateIndex: null,
        });
        // The Node commits A, but its reply never reaches the originating replica.
        const lostReply = yield* Effect.promise(() => node.accept(commandA));
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .get(),
        ).toEqual(originalA);
        const pendingA = commandA;
        const captured = yield* Effect.promise(() =>
          node.snapshot({ pendingCommands: [pendingA] }),
        );
        expect(captured.nodeIndex).toBe(1);
        expect(captured.pushIndex).toBe(1);
        const allocatedA = Schema.decodeUnknownSync(
          AggregateNodeCommandSchema.members[1],
        )({
          ...commandA,
          ...lostReply,
          id: makeNodeCommandId(lostReply.nodeId, lostReply.pushIndex),
        });
        expect(yield* Effect.promise(() => node.accept(allocatedA))).toEqual(
          lostReply,
        );
        expect(
          yield* Effect.promise(() =>
            node.snapshot({ pendingCommands: [allocatedA] }),
          ),
        ).toEqual(captured);
        expect(
          Schema.is(AggregateNodeCommandSchema)({
            ...commandA,
            nodeId: lostReply.nodeId,
          }),
        ).toBe(false);
        expect(
          Schema.is(AggregateNodeCommandSchema)({
            ...allocatedA,
            id: 'cmd_wrong',
          }),
        ).toBe(false);
        yield* Effect.promise(() =>
          expect(
            node.accept({ ...allocatedA, nodeIndex: allocatedA.nodeIndex + 1 }),
          ).rejects.toMatchObject({
            code: 'session-staged-coordinate-conflict',
          }),
        );
        yield* Effect.promise(() =>
          expect(
            node.accept({ ...allocatedA, sessionIndex: 99 }),
          ).rejects.toMatchObject({
            code: 'session-snapshot-acknowledged-command-missing',
          }),
        );

        expect(captured.resources).toMatchObject([
          { id: 'cnt_shared', amount: 1 },
        ]);
        expect(captured.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: 1,
            commandName: 'increment',
            nodeId: lostReply.nodeId,
            nodeIndex: 1,
            resolution: null,
          },
        ]);
        // A new timestamp cannot reinterpret an already retained Session submission.
        const retainedBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeCommands),
        );
        const authoritativeBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(counterV1.drizzleSchema),
        );
        const metadataBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeMetadata),
        );
        // Fresh submissions must still match every bound owner, Actor, session and claim field.
        for (const changedIdentity of [
          { aggregateId: 'another' },
          { actorVersion: 2 },
          { sessionName: 'another' },
          { claims: { aggregateId: 'recovery', memberId: 'another' } },
        ]) {
          const refused = yield* Effect.tryPromise({
            try: () =>
              node.accept({
                ...commandA,
                sessionIndex: 99,
                ...changedIdentity,
              }),
            catch: error => error,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected another bound identity to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: 'node-command-identity-mismatch',
          });
          expect(
            yield* Effect.promise(() =>
              Promise.all([
                node.db.select().from(aggregateNodeCommands),
                node.db.select().from(aggregateNodeMetadata),
                node.db.select().from(counterV1.drizzleSchema),
              ]),
            ),
          ).toEqual([
            retainedBeforeConflict,
            metadataBeforeConflict,
            authoritativeBeforeConflict,
          ]);
        }
        // A known command name cannot select a different authored contract revision.
        const wrongContract = yield* Effect.tryPromise({
          try: () =>
            node.accept({
              ...commandA,
              sessionIndex: 99,
              contractVersion: 2,
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(wrongContract)) {
          throw new Error('Expected another contract revision to refuse');
        }
        expect(Cause.squash(wrongContract.cause)).toMatchObject({
          code: 'node-command-contract-mismatch',
        });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(aggregateNodeCommands),
              node.db.select().from(aggregateNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([
          retainedBeforeConflict,
          metadataBeforeConflict,
          authoritativeBeforeConflict,
        ]);

        const conflictingRetry = yield* Effect.tryPromise({
          try: () =>
            node.accept({
              ...commandA,
              stagingOutcome: {
                ...commandA.stagingOutcome,
                completedAt: new Date(
                  new Date(commandA.stagingOutcome.completedAt).getTime() + 1,
                ).toISOString(),
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(conflictingRetry)) {
          throw new Error('Expected conflicting retained input to refuse');
        }
        expect(Cause.squash(conflictingRetry.cause)).toMatchObject({
          code: 'node-command-input-conflict',
        });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(aggregateNodeCommands),
          ),
        ).toEqual(retainedBeforeConflict);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(authoritativeBeforeConflict);
        expect(
          yield* Effect.promise(() =>
            node.snapshot({ pendingCommands: [pendingA] }),
          ),
        ).toEqual(captured);
        // A second replica sees shared optimism without retaining A as its own command.
        const observed = yield* Effect.promise(() => node.snapshot());
        yield* installAggregateNodeView({
          db: observer,
          definition,
          snapshot: observed,
          sessionId: 'sesn_observer',
        });
        expect(
          observer.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(
          observer
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual([]);
        const stagedB = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'increment',
          contract: increment,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const commandB = Schema.decodeUnknownSync(AggregateNodeCommandSchema)({
          ...Schema.encodeSync(SessionSubmissionSchema)(
            yield* encodeCommand({ contract: increment, command: stagedB }),
          ),
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        });
        const originalB = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all()
          .find(row => row.sessionIndex === 2)!;
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        const retried = yield* Effect.promise(() => node.accept(commandA));
        expect(retried).toEqual(lostReply);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(aggregateNodeCommands),
          ),
        ).toHaveLength(1);
        // Fail after real replay writes, with prior installation writes still uncommitted.
        const commandsBeforeRollback = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        const metadataBeforeRollback = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
          .all();
        const resourcesBeforeRollback = origin
          .select()
          .from(counterV1.drizzleSchema)
          .all();
        // A has no local coordinates yet: only the captured-prefix bound can reject its future position.
        for (const invalidView of [
          {
            snapshot: {
              ...captured,
              identity: { ...captured.identity, sessionName: 'another' },
            },
            code: 'session-snapshot-identity-conflict',
          },
          {
            snapshot: {
              ...captured,
              commandCoverage: captured.commandCoverage.map(coverage =>
                coverage.nodeId === null
                  ? coverage
                  : { ...coverage, nodeIndex: captured.nodeIndex + 1 },
              ),
            },
            code: 'session-staged-coordinate-conflict',
          },
          {
            snapshot: {
              ...captured,
              commandCoverage: captured.commandCoverage.map(coverage =>
                coverage.nodeId === null
                  ? coverage
                  : {
                      ...coverage,
                      resolution: {
                        id: makeNodeCommandId(
                          coverage.nodeId,
                          coverage.pushIndex,
                        ),
                        commandName: coverage.commandName,
                        aggregateIndex: 1,
                        failure: null,
                      },
                    },
              ),
            },
            code: 'session-snapshot-receipt-invalid',
          },
        ]) {
          const refused = yield* installAggregateNodeView({
            db: origin,
            definition,
            snapshot: invalidView.snapshot,
            sessionId,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected invalid captured view to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: invalidView.code,
          });
          expect(
            origin
              .select()
              .from(aggregateSessionRepoDbConfig.schema.commands)
              .all(),
          ).toEqual(commandsBeforeRollback);
          expect(
            origin
              .select()
              .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
              .all(),
          ).toEqual(metadataBeforeRollback);
          expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
            resourcesBeforeRollback,
          );
        }
        const lateWriteFailure = new Error(
          'aggregate replay failed after writing',
        );
        const applyOperation = operationApplication.applyOperationTx;
        let replayWrites = 0;
        const applicationFault = vi
          .spyOn(operationApplication, 'applyOperationTx')
          .mockImplementation(input =>
            Effect.gen(function* () {
              expect(
                origin.select().from(counterV1.drizzleSchema).get(),
              ).toMatchObject({ amount: 1 });
              yield* applyOperation(input);
              replayWrites++;
              expect(
                origin.select().from(counterV1.drizzleSchema).get(),
              ).toMatchObject({ amount: 2 });
              expect(
                origin
                  .select()
                  .from(aggregateSessionRepoDbConfig.schema.commands)
                  .all()
                  .find(row => row.sessionIndex === commandA.sessionIndex),
              ).toMatchObject({
                nodeId: lostReply.nodeId,
                nodeIndex: 1,
                inverseOperations: null,
              });
              expect(
                origin
                  .select()
                  .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
                  .get(),
              ).toMatchObject({ afterNodeIndex: 1 });
              return yield* Effect.die(lateWriteFailure);
            }),
          );
        const rolledBack = yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: captured,
          sessionId,
        }).pipe(
          Effect.exit,
          Effect.ensuring(Effect.sync(() => applicationFault.mockRestore())),
        );
        if (Exit.isSuccess(rolledBack)) {
          throw new Error('Expected installer replay failure');
        }
        expect(Cause.squash(rolledBack.cause)).toBe(lateWriteFailure);
        expect(replayWrites).toBe(1);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual(commandsBeforeRollback);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
            .all(),
        ).toEqual(metadataBeforeRollback);
        expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
          resourcesBeforeRollback,
        );
        yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: captured,
          sessionId,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        const installed = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        expect(installed).toHaveLength(2);
        expect(
          installed.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: lostReply.nodeId,
          nodeIndex: 1,
          pushIndex: 1,
          inverseOperations: null,
        });
        expect(installed.find(row => row.sessionIndex === 2)).toMatchObject({
          sessionIndex: originalB.sessionIndex,
          payload: originalB.payload,
          stagingOutcome: originalB.stagingOutcome,
          nodeId: null,
          nodeIndex: null,
          aggregateIndex: null,
        });
        expect(
          installed.find(row => row.sessionIndex === 2)?.inverseOperations,
        ).not.toBeNull();
        // The valid observer view omits coverage required by this originating replica.
        expect(observed.commandCoverage).toEqual([]);
        const metadataBeforeRefusal = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
          .all();
        const resourcesBeforeRefusal = origin
          .select()
          .from(counterV1.drizzleSchema)
          .all();
        const incompleteView = yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: observed,
          sessionId,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(incompleteView)) {
          throw new Error(
            'Expected missing retained-command coverage to refuse',
          );
        }
        expect(Cause.squash(incompleteView.cause)).toMatchObject({
          code: 'session-snapshot-pending-partition-invalid',
        });
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual(installed);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
            .all(),
        ).toEqual(metadataBeforeRefusal);
        expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
          resourcesBeforeRefusal,
        );
        const wrongLocalSession = yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: captured,
          sessionId: 'sesn_another',
        }).pipe(Effect.exit);
        if (Exit.isSuccess(wrongLocalSession)) {
          throw new Error('Expected another local session identity to refuse');
        }
        expect(Cause.squash(wrongLocalSession.cause)).toMatchObject({
          code: 'session-snapshot-identity-conflict',
        });
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual(installed);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
            .all(),
        ).toEqual(metadataBeforeRefusal);
        expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
          resourcesBeforeRefusal,
        );
        // Inject selected final delivery only: empty delta removes A's optimistic increment.
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(lostReply.nodeId, 1),
            commandName: 'increment',
            aggregateIndex: 1,
            dispositionChainHash: finalHash,
            failure: null,
            delta: { upserted: [], deleted: [] },
          }),
        );
        const final = yield* Effect.promise(() =>
          node.snapshot({
            pendingCommands: [
              {
                ...commandA,
                id: makeNodeCommandId(lostReply.nodeId, lostReply.pushIndex),
                nodeId: lostReply.nodeId,
                nodeIndex: 1,
                pushIndex: 1,
              },
            ],
          }),
        );
        expect(final.nodeIndex).toBe(2);
        expect(final.pushIndex).toBe(1);
        expect(final.outcomeIndex).toBe(1);
        expect(final.metadata.admittedThroughPushIndex).toBe(1);
        expect(final.commandCoverage[0]?.resolution).toEqual({
          id: makeNodeCommandId(lostReply.nodeId, 1),
          commandName: 'increment',
          aggregateIndex: 1,
          failure: null,
        });
        expect(final.resources).toMatchObject([
          { id: 'cnt_shared', amount: 0 },
        ]);
        yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: final,
          sessionId,
        });
        const settled = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        expect(settled).toHaveLength(2);
        expect(
          settled.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: lostReply.nodeId,
          nodeIndex: 1,
          pushIndex: 1,
          inverseOperations: null,
          aggregateIndex: 1,
        });
        expect(settled.find(row => row.sessionIndex === 2)).toMatchObject({
          sessionIndex: originalB.sessionIndex,
          stagingOutcome: originalB.stagingOutcome,
          aggregateIndex: null,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(aggregateNodeCommands),
          ),
        ).toHaveLength(2);
        // Retain B, then commit a foreign selected final before failing projection.
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        expect(retainedB.nodeIndex).toBe(3);
        const foreignResource = {
          ...baselineResource,
          amount: 1,
          updatedAt: new Date(baselineResource.updatedAt.getTime() + 1000),
        };
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'increment',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: { upserted: [foreignResource], deleted: [] },
          }),
        );
        const committedHistory = yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeCommands),
        );
        const committedResources = yield* Effect.promise(() =>
          node.db.select().from(counterV1.drizzleSchema),
        );
        const committedMetadata = yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeMetadata),
        );
        expect(
          committedHistory.map(row => ({
            id: row.id,
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            aggregateIndex: row.aggregateIndex,
          })),
        ).toEqual([
          { id: null, nodeIndex: 1, pushIndex: 1, aggregateIndex: null },
          {
            id: makeNodeCommandId(lostReply.nodeId, 1),
            nodeIndex: 2,
            pushIndex: null,
            aggregateIndex: 1,
          },
          { id: null, nodeIndex: 3, pushIndex: 2, aggregateIndex: null },
          {
            id: 'cmd_foreign',
            nodeIndex: 4,
            pushIndex: null,
            aggregateIndex: 2,
          },
        ]);
        expect(committedResources).toMatchObject([
          { id: 'cnt_shared', amount: 1 },
        ]);
        expect(committedMetadata).toMatchObject([
          {
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            admittedThroughPushIndex: 1,
          },
        ]);
        const projectionFailure = new Error(
          'aggregate projection failed after final commit',
        );
        const project = view.project.bind(view);
        let projectedAfterCommit = false;
        const projectionFault = vi
          .spyOn(view, 'project')
          .mockImplementation((resources, commands) => {
            const projected = project(resources, commands);
            expect(projected).toMatchObject([{ id: 'cnt_shared', amount: 2 }]);
            projectedAfterCommit = true;
            throw projectionFailure;
          });
        const failedProjection = yield* Effect.tryPromise({
          try: () =>
            node.snapshot({
              pendingCommands: [
                {
                  ...commandB,
                  id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
                  nodeId: retainedB.nodeId,
                  nodeIndex: retainedB.nodeIndex,
                  pushIndex: retainedB.pushIndex,
                },
              ],
            }),
          catch: error => error,
        }).pipe(
          Effect.exit,
          Effect.ensuring(Effect.sync(() => projectionFault.mockRestore())),
        );
        if (Exit.isSuccess(failedProjection)) {
          throw new Error('Expected derived projection failure');
        }
        expect(Cause.squash(failedProjection.cause)).toMatchObject({
          code: 'node-optimistic-view-failed',
        });
        expect(projectedAfterCommit).toBe(true);
        expect(node.status()).toMatchObject({
          localAvailability: 'failed',
          blockedWork: true,
        });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(aggregateNodeCommands),
          ),
        ).toEqual(committedHistory);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(committedResources);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(aggregateNodeMetadata),
          ),
        ).toEqual(committedMetadata);
        yield* Effect.promise(() => node.close());
        const rebuiltView = yield* Effect.promise(() =>
          makeAggregateNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const reconstructed = new AggregateNode(
          node.db,
          node.definition,
          rebuiltView,
          {
            ...definition,
            models: {
              counter: makeModelVersion(
                defineModel({ name: 'counter', abbreviation: 'cnt' }),
                {
                  version: 1,
                  attributes: { amount: primitives.integer() },
                  indexes: [
                    {
                      name: 'unique_counter_amount',
                      columns: ['amount'],
                      unique: true,
                    },
                  ],
                },
              ),
            },
          },
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => reconstructed.close()),
        );
        // The old snapshot can contain rows that a newly added unique index rejects.
        const [originalSource] = yield* Effect.promise(() =>
          node.db.values<[string]>(
            sql`SELECT resources FROM nodeReadTableBaseline WHERE slot = 1`,
          ),
        );
        yield* Effect.promise(() =>
          node.db.run(sql`UPDATE nodeReadTableBaseline SET resources =
          json_insert(resources, '$[#]', json_set(json_extract(resources, '$[0]'), '$.id', 'cnt_other')) WHERE slot = 1`),
        );
        yield* Effect.promise(() =>
          expect(
            reconstructed.initializeConnectedStorage(false),
          ).rejects.toMatchObject({
            code: 'node-read-tables-snapshot-required',
          }),
        );
        yield* Effect.promise(() =>
          node.db.run(
            sql`UPDATE nodeReadTableBaseline SET resources = ${originalSource![0]} WHERE slot = 1`,
          ),
        );
        // A mismatched final prevents the cached baseline from reaching the checkpoint. Roll back the attempted DDL.
        yield* Effect.promise(() => node.db.run(sql`DROP TABLE counter`));
        yield* Effect.promise(() =>
          node.db.run(
            sql`UPDATE commands SET dispositionChainHash = 'mismatch' WHERE aggregateIndex = 2`,
          ),
        );
        yield* Effect.promise(() =>
          expect(
            reconstructed.initializeConnectedStorage(false),
          ).rejects.toMatchObject({
            code: 'node-read-tables-snapshot-required',
            extra: { nodeId: retainedB.nodeId },
          }),
        );
        expect(
          yield* Effect.promise(() =>
            node.db.values(
              sql`SELECT name FROM sqlite_master WHERE name = 'counter'`,
            ),
          ),
        ).toEqual([]);
        yield* Effect.promise(() =>
          node.db.run(
            sql`UPDATE commands SET dispositionChainHash = ${'2'.repeat(64)} WHERE aggregateIndex = 2`,
          ),
        );
        expect(
          yield* Effect.promise(() =>
            reconstructed.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        const rebuilt = yield* Effect.promise(() =>
          reconstructed.snapshot({
            pendingCommands: [
              {
                ...commandB,
                id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
                nodeId: retainedB.nodeId,
                nodeIndex: retainedB.nodeIndex,
                pushIndex: retainedB.pushIndex,
              },
            ],
          }),
        );
        expect(rebuilt).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          metadata: { aggregateIndex: 2, admittedThroughPushIndex: 1 },
          resources: [{ id: 'cnt_shared', amount: 2 }],
        });
        expect(rebuilt.state).toMatchObject({
          localAvailability: 'available',
          blockedWork: false,
        });
        expect(rebuilt.commandCoverage).toEqual([
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: 2,
            commandName: 'increment',
            nodeId: retainedB.nodeId,
            nodeIndex: 3,
            resolution: null,
          },
        ]);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(aggregateNodeCommands),
          ),
        ).toEqual(committedHistory);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(committedResources);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(aggregateNodeMetadata),
          ),
        ).toEqual(committedMetadata);
        // Lost acknowledgement advances admission only; B has no final resolution.
        yield* Effect.promise(() => reconstructed.reconcileAdmission(3));
        const progressed = yield* Effect.promise(() =>
          reconstructed.snapshot(),
        );
        expect(progressed.metadata.admittedThroughPushIndex).toBe(2);
        expect(progressed.outcomeIndex).toBe(1);
        const authoritative = yield* Effect.promise(() =>
          reconstructed.snapshot({ authoritative: true }),
        );
        expect(authoritative.resources).toMatchObject([{ amount: 1 }]);
        expect(progressed.resources).toMatchObject([{ amount: 2 }]);
        for (const impossible of [4, 2]) {
          yield* Effect.promise(() =>
            expect(
              reconstructed.reconcileAdmission(impossible),
            ).rejects.toMatchObject({
              code: 'node-admission-history-conflict',
            }),
          );
        }
        expect(
          (yield* Effect.promise(() => reconstructed.snapshot())).metadata
            .admittedThroughPushIndex,
        ).toBe(2);
        // A preserving reset may replace derived checkpoint evidence without reusing session positions.
        const repairedView = yield* Effect.promise(() =>
          reconstructed.snapshot({ pendingCommands: [commandA, commandB] }),
        );
        origin
          .update(aggregateSessionRepoDbConfig.schema.sessionMetadata)
          .set({
            afterNodeIndex: repairedView.nodeIndex + 1,
            aggregateIndex: repairedView.metadata.aggregateIndex! + 1,
          })
          .run();
        const unannouncedRewind = yield* installAggregateNodeView({
          db: origin,
          definition,
          sessionId,
          snapshot: repairedView,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(unannouncedRewind)) {
          throw new Error(
            'Expected an unannounced checkpoint rewind to refuse',
          );
        }
        expect(Cause.squash(unannouncedRewind.cause)).toMatchObject({
          code: 'session-snapshot-checkpoint-conflict',
        });
        const repairedReplica = yield* installAggregateNodeView({
          db: origin,
          definition,
          sessionId,
          snapshot: repairedView,
          replaceCheckpoint: true,
        });
        expect(repairedReplica.lastSessionIndex).toBe(2);
        expect(repairedReplica.afterNodeIndex).toBe(repairedView.nodeIndex);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual([
          {
            ...originalB,
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            pushIndex: retainedB.pushIndex,
            inverseOperations: null,
          },
        ]);
        yield* installAggregateNodeView({
          db: origin,
          definition,
          sessionId,
          snapshot: progressed,
          discardPending: true,
        });
        const afterDiscard = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'increment',
          contract: increment,
          payload: {},
        });
        expect(afterDiscard.sessionIndex).toBe(3);
        expect(afterDiscard).not.toHaveProperty('id');
        // A sparse disposable boundary fixture stands in for the preceding retained prefix.
        // Keep the producer index low to exercise append exhaustion independently.
        yield* Effect.promise(() =>
          reconstructed.db
            .update(aggregateNodeCommands)
            .set({ nodeIndex: Number.MAX_SAFE_INTEGER - 2 })
            .where(
              eq(aggregateNodeCommands.sessionIndex, commandB.sessionIndex),
            ),
        );
        const appendBoundaryCommand = {
          ...commandB,
          sessionIndex: 3,
        };
        const lastAppend = yield* Effect.promise(() =>
          reconstructed.accept(appendBoundaryCommand),
        );
        expect(lastAppend).toEqual({
          sessionId: appendBoundaryCommand.sessionId,
          sessionIndex: appendBoundaryCommand.sessionIndex,
          pushIndex: 3,
          nodeId: retainedB.nodeId,
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
        });
        const appendBoundaryHistory = yield* Effect.promise(() =>
          reconstructed.db.select().from(aggregateNodeCommands),
        );
        expect(
          appendBoundaryHistory.find(
            row => row.sessionIndex === appendBoundaryCommand.sessionIndex,
          ),
        ).toMatchObject({
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
          pushIndex: 3,
        });
        const exhaustedAppend = yield* Effect.tryPromise({
          try: () => reconstructed.accept({ ...commandB, sessionIndex: 4 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedAppend)) {
          throw new Error('Expected exhausted Node allocation to refuse');
        }
        expect(Cause.squash(exhaustedAppend.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(
          yield* Effect.promise(() =>
            reconstructed.accept(appendBoundaryCommand),
          ),
        ).toEqual(lastAppend);
        expect(
          yield* Effect.promise(() => reconstructed.accept(commandA)),
        ).toEqual(lostReply);
        // Existing selected finals also retry before the exhausted append allocator.
        yield* Effect.promise(() =>
          reconstructed.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'increment',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: { upserted: [foreignResource], deleted: [] },
          }),
        );
        const exhaustedFinal = yield* Effect.tryPromise({
          try: () =>
            reconstructed.receiveCommand({
              id: 'cmd_exhausted_final',
              commandName: 'increment',
              aggregateIndex: 3,
              dispositionChainHash: '3'.repeat(64),
              failure: null,
              delta: {
                upserted: [{ ...foreignResource, amount: 999 }],
                deleted: [],
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedFinal)) {
          throw new Error('Expected exhausted final append to refuse');
        }
        expect(Cause.squash(exhaustedFinal.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(reconstructed.status()).toMatchObject({ blockedWork: true });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              reconstructed.db.select().from(aggregateNodeCommands),
              reconstructed.db.select().from(aggregateNodeMetadata),
              reconstructed.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([
          appendBoundaryHistory,
          [{ ...committedMetadata[0]!, admittedThroughPushIndex: 2 }],
          committedResources,
        ]);
        // With no selected finals, append and producer coordinates can reach the same bound.
        const producerStorage = yield* openTestDb({});
        const producerView = yield* Effect.promise(() =>
          makeAggregateNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const producerNode = new AggregateNode(
          nodeDb(producerStorage.db.$client),
          node.definition,
          producerView,
          definition,
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => producerNode.close()),
        );
        yield* Effect.promise(() => producerNode.initializeConnectedStorage());
        yield* Effect.promise(() =>
          producerNode.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const producerFirst = yield* Effect.promise(() =>
          producerNode.accept(commandB),
        );
        // The admission reply was lost. Its effect already appears in the authenticated snapshot.
        yield* Effect.promise(() =>
          producerNode.db.run(
            sql`ALTER TABLE nodeReadTableBaseline DROP COLUMN resources`,
          ),
        );
        yield* Effect.promise(() =>
          producerNode.db.run(sql`DROP TABLE counter`),
        );
        yield* Effect.promise(() =>
          expect(
            producerNode.initializeConnectedStorage(false),
          ).rejects.toMatchObject({
            code: 'node-read-tables-snapshot-required',
          }),
        );
        yield* Effect.promise(() =>
          producerNode.initializeConnectedStorage(true, {
            aggregateIndex: 1,
            dispositionChainHash: finalHash,
            resolvedThrough: 1,
            resources: [{ ...baselineResource, amount: 1 }],
          }),
        );
        expect(
          yield* Effect.promise(() => producerNode.snapshot()),
        ).toMatchObject({
          pushIndex: 1,
          outcomeIndex: 0,
          metadata: {
            nodeId: producerFirst.nodeId,
            admittedThroughPushIndex: 0,
          },
          resources: [{ id: 'cnt_shared', amount: 1 }],
        });
        // Losing only the read baseline must not infer that the covered original is optimistic again.
        yield* Effect.promise(() =>
          producerNode.db.run(sql`DROP TABLE nodeReadTableBaseline`),
        );
        yield* Effect.promise(() =>
          expect(
            producerNode.initializeConnectedStorage(false),
          ).rejects.toMatchObject({
            code: 'node-read-tables-snapshot-required',
          }),
        );
        yield* Effect.promise(() =>
          producerNode.initializeConnectedStorage(true, {
            aggregateIndex: 1,
            dispositionChainHash: finalHash,
            resolvedThrough: 1,
            resources: [{ ...baselineResource, amount: 1 }],
          }),
        );
        expect(
          (yield* Effect.promise(() => producerNode.snapshot())).resources,
        ).toMatchObject([{ amount: 1 }]);
        expect(
          yield* Effect.promise(() => producerNode.accept(commandB)),
        ).toEqual(producerFirst);
        yield* Effect.promise(() =>
          producerNode.db
            .update(aggregateNodeCommands)
            .set({
              nodeIndex: Number.MAX_SAFE_INTEGER - 2,
              pushIndex: Number.MAX_SAFE_INTEGER - 2,
            })
            .where(
              eq(aggregateNodeCommands.sessionIndex, commandB.sessionIndex),
            ),
        );
        const producerMetadata = yield* Effect.promise(() =>
          producerNode.db.select().from(aggregateNodeMetadata),
        );
        const producerResources = yield* Effect.promise(() =>
          producerNode.db.select().from(counterV1.drizzleSchema),
        );
        const producerBoundaryCommand = {
          ...commandB,
          sessionIndex: 3,
        };
        const lastProducer = yield* Effect.promise(() =>
          producerNode.accept(producerBoundaryCommand),
        );
        expect(lastProducer).toEqual({
          sessionId: producerBoundaryCommand.sessionId,
          sessionIndex: producerBoundaryCommand.sessionIndex,
          pushIndex: Number.MAX_SAFE_INTEGER - 1,
          nodeId: producerFirst.nodeId,
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
        });
        const producerHistory = yield* Effect.promise(() =>
          producerNode.db.select().from(aggregateNodeCommands),
        );
        expect(
          producerHistory.map(row => ({
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            aggregateIndex: row.aggregateIndex,
          })),
        ).toEqual([
          {
            nodeIndex: Number.MAX_SAFE_INTEGER - 2,
            pushIndex: Number.MAX_SAFE_INTEGER - 2,
            aggregateIndex: null,
          },
          {
            nodeIndex: Number.MAX_SAFE_INTEGER - 1,
            pushIndex: Number.MAX_SAFE_INTEGER - 1,
            aggregateIndex: null,
          },
        ]);
        const exhaustedProducer = yield* Effect.tryPromise({
          try: () => producerNode.accept({ ...commandB, sessionIndex: 4 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedProducer)) {
          throw new Error('Expected exhausted producer allocation to refuse');
        }
        expect(Cause.squash(exhaustedProducer.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(
          yield* Effect.promise(() =>
            producerNode.accept(producerBoundaryCommand),
          ),
        ).toEqual(lastProducer);
        expect(
          yield* Effect.promise(() => producerNode.accept(commandB)),
        ).toEqual({
          ...producerFirst,
          nodeIndex: Number.MAX_SAFE_INTEGER - 2,
          pushIndex: Number.MAX_SAFE_INTEGER - 2,
        });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              producerNode.db.select().from(aggregateNodeCommands),
              producerNode.db.select().from(aggregateNodeMetadata),
              producerNode.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([producerHistory, producerMetadata, producerResources]);
      }),
  );

  it.effect(
    'service preserves recovery through refusals, replay rollback and projection failure',
    () =>
      Effect.gen(function* () {
        const increment = makeServiceContractRelease(
          defineServiceContract('increment'),
          {
            version: 1,
            payload: {},
            result: Schema.Number,
            models: {
              counter: {
                model: models.counter,
                fields: ['createdAt', 'updatedAt', 'amount'],
              },
            },
            operations: { update: counterV1.operations.update },
            program: Effect.fn('serviceIncrement.program')(function* ({
              db,
              operations,
            }) {
              const row = yield* findFirst({
                db,
                model: db.models.counter,
                where: { id: { eq: 'cnt_shared' } },
              });
              if (row === undefined) throw new Error('Missing seeded counter');
              yield* operations.update({
                resourceId: row.id,
                attributes: { amount: row.amount + 1 },
              });
              return row.amount + 1;
            }),
          },
        );
        const release = makeServiceRelease(
          defineService({ name: 'recovery' }),
          { version: 1, models, system: { increment } },
        );
        const definition = makeServiceSessionDefinition({
          systemName: 'recovery',
          serviceName: release.name,
          serviceVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'counter',
          claimsSchema: Schema.Struct({ memberId: Schema.String }),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        const context = yield* Effect.context<never>();
        const view = yield* Effect.promise(() =>
          makeServiceNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const node = new ServiceNode(
          nodeDb(storage.db.$client),
          {
            identity: {
              apiUrl: 'https://recovery.example',
              publishableKey: 'pub_recovery',
              systemName: definition.systemName,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,

              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { memberId: 'member' },
              definitionHash: 'recovery',
            },
            lock: makeServiceSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
        yield* Effect.promise(() => node.initializeConnectedStorage());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            serviceIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const origin = yield* openReplica(serviceSessionRepoDbConfig.tables);
        const observer = yield* openReplica(serviceSessionRepoDbConfig.tables);

        const initial = yield* Effect.promise(() => node.snapshot());
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: initial,
        });
        yield* installServiceNodeView({
          sessionId: 'sesn_observer',
          db: observer,
          definition,
          snapshot: initial,
        });
        const stagedA = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          contract: increment,
          payload: {},
          claims: { memberId: 'member' },
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('a')));
        const commandA = stagedA.command;
        const originalA = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .get()!;
        expect(originalA).toMatchObject({
          sessionIndex: 1,
          nodeId: null,
          nodeIndex: null,
          serviceIndex: null,
        });
        // The Node commits A, but its reply never reaches the originating replica.
        const lostReply = yield* Effect.promise(() => node.accept(commandA));
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.commands)
            .get(),
        ).toEqual(originalA);
        const pendingA = commandA;
        const captured = yield* Effect.promise(() =>
          node.snapshot({ pendingCommands: [pendingA] }),
        );
        expect(captured.nodeIndex).toBe(1);
        expect(captured.pushIndex).toBe(1);
        expect(captured.resources).toMatchObject([
          { id: 'cnt_shared', amount: 1 },
        ]);
        expect(captured.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: 1,
            commandName: 'increment',
            nodeId: lostReply.nodeId,
            nodeIndex: 1,
            resolution: null,
          },
        ]);
        // A new timestamp cannot reinterpret an already retained Session submission.
        const retainedBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(serviceNodeCommands),
        );
        const authoritativeBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(counterV1.drizzleSchema),
        );
        const metadataBeforeConflict = yield* Effect.promise(() =>
          node.db.select().from(serviceNodeMetadata),
        );
        // Fresh submissions must still match every bound owner, Actor, session and claim field.
        for (const changedIdentity of [
          { serviceName: 'another' },
          { actorVersion: 2 },
          { sessionName: 'another' },
          { claims: { memberId: 'another' } },
        ]) {
          const refused = yield* Effect.tryPromise({
            try: () =>
              node.accept({
                ...commandA,
                sessionIndex: 99,
                ...changedIdentity,
              }),
            catch: error => error,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected another bound identity to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: 'node-command-identity-mismatch',
          });
          expect(
            yield* Effect.promise(() =>
              Promise.all([
                node.db.select().from(serviceNodeCommands),
                node.db.select().from(serviceNodeMetadata),
                node.db.select().from(counterV1.drizzleSchema),
              ]),
            ),
          ).toEqual([
            retainedBeforeConflict,
            metadataBeforeConflict,
            authoritativeBeforeConflict,
          ]);
        }
        // A known command name cannot select a different authored contract revision.
        const wrongContract = yield* Effect.tryPromise({
          try: () =>
            node.accept({
              ...commandA,
              sessionIndex: 99,
              contractVersion: 2,
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(wrongContract)) {
          throw new Error('Expected another contract revision to refuse');
        }
        expect(Cause.squash(wrongContract.cause)).toMatchObject({
          code: 'node-command-contract-mismatch',
        });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(serviceNodeCommands),
              node.db.select().from(serviceNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([
          retainedBeforeConflict,
          metadataBeforeConflict,
          authoritativeBeforeConflict,
        ]);

        const conflictingRetry = yield* Effect.tryPromise({
          try: () =>
            node.accept({
              ...commandA,
              stagingOutcome: {
                ...commandA.stagingOutcome,
                completedAt: new Date(
                  new Date(commandA.stagingOutcome.completedAt).getTime() + 1,
                ).toISOString(),
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(conflictingRetry)) {
          throw new Error('Expected conflicting retained input to refuse');
        }
        expect(Cause.squash(conflictingRetry.cause)).toMatchObject({
          code: 'node-command-input-conflict',
        });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(serviceNodeCommands),
          ),
        ).toEqual(retainedBeforeConflict);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(authoritativeBeforeConflict);
        expect(
          yield* Effect.promise(() =>
            node.snapshot({ pendingCommands: [pendingA] }),
          ),
        ).toEqual(captured);
        // A second replica sees shared optimism without retaining A as its own command.
        const observed = yield* Effect.promise(() => node.snapshot());
        yield* installServiceNodeView({
          sessionId: 'sesn_observer',
          db: observer,
          definition,
          snapshot: observed,
        });
        expect(
          observer.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(
          observer
            .select()
            .from(serviceSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual([]);
        const stagedB = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          contract: increment,
          payload: {},
          claims: { memberId: 'member' },
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const commandB = stagedB.command;
        const originalB = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all()
          .find(row => row.sessionIndex === 2)!;
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        const retried = yield* Effect.promise(() => node.accept(commandA));
        expect(retried).toEqual(lostReply);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(serviceNodeCommands),
          ),
        ).toHaveLength(1);
        // Fail after real replay writes, with prior installation writes still uncommitted.
        const commandsBeforeRollback = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        const metadataBeforeRollback = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
          .all();
        const resourcesBeforeRollback = origin
          .select()
          .from(counterV1.drizzleSchema)
          .all();
        // A has no local coordinates yet: only the captured-prefix bound can reject its future position.
        for (const invalidView of [
          {
            snapshot: {
              ...captured,
              identity: { ...captured.identity, sessionName: 'another' },
            },
            code: 'session-snapshot-identity-conflict',
          },
          {
            snapshot: {
              ...captured,
              commandCoverage: captured.commandCoverage.map(coverage =>
                coverage.nodeId === null
                  ? coverage
                  : { ...coverage, nodeIndex: captured.nodeIndex + 1 },
              ),
            },
            code: 'session-staged-coordinate-conflict',
          },
          {
            snapshot: {
              ...captured,
              commandCoverage: captured.commandCoverage.map(coverage =>
                coverage.nodeId === null
                  ? coverage
                  : {
                      ...coverage,
                      resolution: {
                        id: makeNodeCommandId(
                          coverage.nodeId,
                          coverage.pushIndex,
                        ),
                        commandName: coverage.commandName,
                        serviceIndex: 1,
                        failure: null,
                      },
                    },
              ),
            },
            code: 'session-snapshot-receipt-invalid',
          },
        ]) {
          const refused = yield* installServiceNodeView({
            sessionId: 'sesn_origin',
            db: origin,
            definition,
            snapshot: invalidView.snapshot,
          }).pipe(Effect.exit);
          if (Exit.isSuccess(refused)) {
            throw new Error('Expected invalid captured view to refuse');
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: invalidView.code,
          });
          expect(
            origin
              .select()
              .from(serviceSessionRepoDbConfig.schema.commands)
              .all(),
          ).toEqual(commandsBeforeRollback);
          expect(
            origin
              .select()
              .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
              .all(),
          ).toEqual(metadataBeforeRollback);
          expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
            resourcesBeforeRollback,
          );
        }
        const lateWriteFailure = new Error(
          'service replay failed after writing',
        );
        const applyOperation = operationApplication.applyOperationTx;
        let replayWrites = 0;
        const applicationFault = vi
          .spyOn(operationApplication, 'applyOperationTx')
          .mockImplementation(input =>
            Effect.gen(function* () {
              expect(
                origin.select().from(counterV1.drizzleSchema).get(),
              ).toMatchObject({ amount: 1 });
              yield* applyOperation(input);
              replayWrites++;
              expect(
                origin.select().from(counterV1.drizzleSchema).get(),
              ).toMatchObject({ amount: 2 });
              expect(
                origin
                  .select()
                  .from(serviceSessionRepoDbConfig.schema.commands)
                  .all()
                  .find(row => row.sessionIndex === commandA.sessionIndex),
              ).toMatchObject({
                nodeId: lostReply.nodeId,
                nodeIndex: 1,
                inverseOperations: null,
              });
              expect(
                origin
                  .select()
                  .from(
                    serviceSessionRepoDbConfig.schema.serviceSessionMetadata,
                  )
                  .get(),
              ).toMatchObject({ afterNodeIndex: 1 });
              return yield* Effect.die(lateWriteFailure);
            }),
          );
        const rolledBack = yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: captured,
        }).pipe(
          Effect.exit,
          Effect.ensuring(Effect.sync(() => applicationFault.mockRestore())),
        );
        if (Exit.isSuccess(rolledBack)) {
          throw new Error('Expected installer replay failure');
        }
        expect(Cause.squash(rolledBack.cause)).toBe(lateWriteFailure);
        expect(replayWrites).toBe(1);
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual(commandsBeforeRollback);
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
            .all(),
        ).toEqual(metadataBeforeRollback);
        expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
          resourcesBeforeRollback,
        );
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: captured,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        const installed = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        expect(installed).toHaveLength(2);
        expect(
          installed.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: lostReply.nodeId,
          nodeIndex: 1,
          pushIndex: 1,
          inverseOperations: null,
        });
        expect(installed.find(row => row.sessionIndex === 2)).toMatchObject({
          sessionIndex: originalB.sessionIndex,
          payload: originalB.payload,
          stagingOutcome: originalB.stagingOutcome,
          nodeId: null,
          nodeIndex: null,
          serviceIndex: null,
        });
        expect(
          installed.find(row => row.sessionIndex === 2)?.inverseOperations,
        ).not.toBeNull();
        // The valid observer view omits coverage required by this originating replica.
        expect(observed.commandCoverage).toEqual([]);
        const metadataBeforeRefusal = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
          .all();
        const resourcesBeforeRefusal = origin
          .select()
          .from(counterV1.drizzleSchema)
          .all();
        const incompleteView = yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: observed,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(incompleteView)) {
          throw new Error(
            'Expected missing retained-command coverage to refuse',
          );
        }
        expect(Cause.squash(incompleteView.cause)).toMatchObject({
          code: 'session-snapshot-pending-partition-invalid',
        });
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual(installed);
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
            .all(),
        ).toEqual(metadataBeforeRefusal);
        expect(origin.select().from(counterV1.drizzleSchema).all()).toEqual(
          resourcesBeforeRefusal,
        );
        // Inject selected final delivery only: empty delta removes A's optimistic increment.
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(lostReply.nodeId, 1),
            commandName: 'increment',
            serviceIndex: 1,
            dispositionChainHash: finalHash,
            failure: null,
            delta: { upserted: [], deleted: [] },
          }),
        );
        const final = yield* Effect.promise(() =>
          node.snapshot({
            pendingCommands: [
              {
                ...commandA,
                id: makeNodeCommandId(lostReply.nodeId, lostReply.pushIndex),
                nodeId: lostReply.nodeId,
                nodeIndex: 1,
                pushIndex: 1,
              },
            ],
          }),
        );
        expect(final.nodeIndex).toBe(2);
        expect(final.pushIndex).toBe(1);
        expect(final.outcomeIndex).toBe(1);
        expect(final.metadata.admittedThroughPushIndex).toBe(1);
        expect(final.commandCoverage[0]?.resolution).toEqual({
          id: makeNodeCommandId(lostReply.nodeId, 1),
          commandName: 'increment',
          serviceIndex: 1,
          failure: null,
        });
        expect(final.resources).toMatchObject([
          { id: 'cnt_shared', amount: 0 },
        ]);
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: final,
        });
        const settled = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        expect(settled).toHaveLength(2);
        expect(
          settled.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: lostReply.nodeId,
          nodeIndex: 1,
          pushIndex: 1,
          inverseOperations: null,
          serviceIndex: 1,
        });
        expect(settled.find(row => row.sessionIndex === 2)).toMatchObject({
          sessionIndex: originalB.sessionIndex,
          stagingOutcome: originalB.stagingOutcome,
          serviceIndex: null,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(serviceNodeCommands),
          ),
        ).toHaveLength(2);
        // Retain B, then commit a foreign selected final before failing projection.
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        expect(retainedB.nodeIndex).toBe(3);
        const foreignResource = {
          ...baselineResource,
          amount: 1,
          updatedAt: new Date(baselineResource.updatedAt.getTime() + 1000),
        };
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'increment',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: { upserted: [foreignResource], deleted: [] },
          }),
        );
        const committedHistory = yield* Effect.promise(() =>
          node.db.select().from(serviceNodeCommands),
        );
        const committedResources = yield* Effect.promise(() =>
          node.db.select().from(counterV1.drizzleSchema),
        );
        const committedMetadata = yield* Effect.promise(() =>
          node.db.select().from(serviceNodeMetadata),
        );
        expect(
          committedHistory.map(row => ({
            id: row.id,
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            serviceIndex: row.serviceIndex,
          })),
        ).toEqual([
          { id: null, nodeIndex: 1, pushIndex: 1, serviceIndex: null },
          {
            id: makeNodeCommandId(lostReply.nodeId, 1),
            nodeIndex: 2,
            pushIndex: null,
            serviceIndex: 1,
          },
          { id: null, nodeIndex: 3, pushIndex: 2, serviceIndex: null },
          { id: 'cmd_foreign', nodeIndex: 4, pushIndex: null, serviceIndex: 2 },
        ]);
        expect(committedResources).toMatchObject([
          { id: 'cnt_shared', amount: 1 },
        ]);
        expect(committedMetadata).toMatchObject([
          {
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            admittedThroughPushIndex: 1,
          },
        ]);
        const projectionFailure = new Error(
          'service projection failed after final commit',
        );
        const project = view.project.bind(view);
        let projectedAfterCommit = false;
        const projectionFault = vi
          .spyOn(view, 'project')
          .mockImplementation((resources, commands) => {
            const projected = project(resources, commands);
            expect(projected).toMatchObject([{ id: 'cnt_shared', amount: 2 }]);
            projectedAfterCommit = true;
            throw projectionFailure;
          });
        const failedProjection = yield* Effect.tryPromise({
          try: () =>
            node.snapshot({
              pendingCommands: [
                {
                  ...commandB,
                  id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
                  nodeId: retainedB.nodeId,
                  nodeIndex: retainedB.nodeIndex,
                  pushIndex: retainedB.pushIndex,
                },
              ],
            }),
          catch: error => error,
        }).pipe(
          Effect.exit,
          Effect.ensuring(Effect.sync(() => projectionFault.mockRestore())),
        );
        if (Exit.isSuccess(failedProjection)) {
          throw new Error('Expected derived projection failure');
        }
        expect(Cause.squash(failedProjection.cause)).toMatchObject({
          code: 'node-optimistic-view-failed',
        });
        expect(projectedAfterCommit).toBe(true);
        expect(node.status()).toMatchObject({
          localAvailability: 'failed',
          blockedWork: true,
        });
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(serviceNodeCommands),
          ),
        ).toEqual(committedHistory);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(committedResources);
        expect(
          yield* Effect.promise(() =>
            node.db.select().from(serviceNodeMetadata),
          ),
        ).toEqual(committedMetadata);
        yield* Effect.promise(() => node.close());
        const rebuiltView = yield* Effect.promise(() =>
          makeServiceNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const reconstructed = new ServiceNode(
          node.db,
          node.definition,
          rebuiltView,
          definition,
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => reconstructed.close()),
        );
        // An older materializer populated these rows with identical DDL. Recompute from the checkpoint.
        yield* Effect.promise(() =>
          node.db.run(sql`UPDATE counter SET amount = 90`),
        );
        yield* Effect.promise(() =>
          node.db.run(
            sql`UPDATE nodeReadTableBaseline SET declarations = '{}'`,
          ),
        );
        expect(
          yield* Effect.promise(() =>
            reconstructed.initializeConnectedStorage(false),
          ),
        ).toEqual({ created: false });
        const rebuilt = yield* Effect.promise(() =>
          reconstructed.snapshot({
            pendingCommands: [
              {
                ...commandB,
                id: makeNodeCommandId(retainedB.nodeId, retainedB.pushIndex),
                nodeId: retainedB.nodeId,
                nodeIndex: retainedB.nodeIndex,
                pushIndex: retainedB.pushIndex,
              },
            ],
          }),
        );
        expect(rebuilt).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          metadata: { serviceIndex: 2, admittedThroughPushIndex: 1 },
          resources: [{ id: 'cnt_shared', amount: 2 }],
        });
        expect(rebuilt.state).toMatchObject({
          localAvailability: 'available',
          blockedWork: false,
        });
        expect(rebuilt.commandCoverage).toEqual([
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: 2,
            commandName: 'increment',
            nodeId: retainedB.nodeId,
            nodeIndex: 3,
            resolution: null,
          },
        ]);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(serviceNodeCommands),
          ),
        ).toEqual(committedHistory);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(counterV1.drizzleSchema),
          ),
        ).toEqual(committedResources);
        expect(
          yield* Effect.promise(() =>
            reconstructed.db.select().from(serviceNodeMetadata),
          ),
        ).toEqual(committedMetadata);
        // Lost acknowledgement advances admission only; B has no final resolution.
        yield* Effect.promise(() => reconstructed.reconcileAdmission(3));
        const progressed = yield* Effect.promise(() =>
          reconstructed.snapshot(),
        );
        expect(progressed.metadata.admittedThroughPushIndex).toBe(2);
        expect(progressed.outcomeIndex).toBe(1);
        const authoritative = yield* Effect.promise(() =>
          reconstructed.snapshot({ authoritative: true }),
        );
        expect(authoritative.resources).toMatchObject([{ amount: 1 }]);
        expect(progressed.resources).toMatchObject([{ amount: 2 }]);
        for (const impossible of [4, 2]) {
          yield* Effect.promise(() =>
            expect(
              reconstructed.reconcileAdmission(impossible),
            ).rejects.toMatchObject({
              code: 'node-admission-history-conflict',
            }),
          );
        }
        expect(
          (yield* Effect.promise(() => reconstructed.snapshot())).metadata
            .admittedThroughPushIndex,
        ).toBe(2);
        // A preserving reset may replace derived checkpoint evidence without reusing session positions.
        const repairedView = yield* Effect.promise(() =>
          reconstructed.snapshot({ pendingCommands: [commandA, commandB] }),
        );
        origin
          .update(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
          .set({
            afterNodeIndex: repairedView.nodeIndex + 1,
            serviceIndex: repairedView.metadata.serviceIndex! + 1,
          })
          .run();
        const unannouncedRewind = yield* installServiceNodeView({
          db: origin,
          definition,
          sessionId: 'sesn_origin',
          snapshot: repairedView,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(unannouncedRewind)) {
          throw new Error(
            'Expected an unannounced checkpoint rewind to refuse',
          );
        }
        expect(Cause.squash(unannouncedRewind.cause)).toMatchObject({
          code: 'session-snapshot-checkpoint-conflict',
        });
        const repairedReplica = yield* installServiceNodeView({
          db: origin,
          definition,
          sessionId: 'sesn_origin',
          snapshot: repairedView,
          replaceCheckpoint: true,
        });
        expect(repairedReplica.lastSessionIndex).toBe(2);
        expect(repairedReplica.afterNodeIndex).toBe(repairedView.nodeIndex);
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.commands)
            .all(),
        ).toEqual([
          {
            ...originalB,
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            pushIndex: retainedB.pushIndex,
            inverseOperations: null,
          },
        ]);
        yield* installServiceNodeView({
          db: origin,
          definition,
          sessionId: 'sesn_origin',
          snapshot: progressed,
          discardPending: true,
        });
        const { command: afterDiscard } = yield* stageServiceSessionCommandTx({
          db: origin,
          definition,
          sessionId: 'sesn_origin',
          contract: increment,
          payload: {},
          claims: { memberId: 'member' },
        });
        expect(afterDiscard.sessionIndex).toBe(3);
        expect(afterDiscard).toMatchObject({
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        });
        // A sparse disposable boundary fixture stands in for the preceding retained prefix.
        // Keep the producer index low to exercise append exhaustion independently.
        yield* Effect.promise(() =>
          reconstructed.db
            .update(serviceNodeCommands)
            .set({ nodeIndex: Number.MAX_SAFE_INTEGER - 2 })
            .where(eq(serviceNodeCommands.sessionIndex, commandB.sessionIndex)),
        );
        const appendBoundaryCommand = {
          ...commandB,
          sessionIndex: 3,
        };
        const lastAppend = yield* Effect.promise(() =>
          reconstructed.accept(appendBoundaryCommand),
        );
        expect(lastAppend).toEqual({
          sessionId: appendBoundaryCommand.sessionId,
          sessionIndex: appendBoundaryCommand.sessionIndex,
          pushIndex: 3,
          nodeId: retainedB.nodeId,
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
        });
        const appendBoundaryHistory = yield* Effect.promise(() =>
          reconstructed.db.select().from(serviceNodeCommands),
        );
        expect(
          appendBoundaryHistory.find(
            row => row.sessionIndex === appendBoundaryCommand.sessionIndex,
          ),
        ).toMatchObject({
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
          pushIndex: 3,
        });
        const exhaustedAppend = yield* Effect.tryPromise({
          try: () => reconstructed.accept({ ...commandB, sessionIndex: 4 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedAppend)) {
          throw new Error('Expected exhausted Node allocation to refuse');
        }
        expect(Cause.squash(exhaustedAppend.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(
          yield* Effect.promise(() =>
            reconstructed.accept(appendBoundaryCommand),
          ),
        ).toEqual(lastAppend);
        expect(
          yield* Effect.promise(() => reconstructed.accept(commandA)),
        ).toEqual(lostReply);
        // Existing selected finals also retry before the exhausted append allocator.
        yield* Effect.promise(() =>
          reconstructed.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'increment',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: { upserted: [foreignResource], deleted: [] },
          }),
        );
        const exhaustedFinal = yield* Effect.tryPromise({
          try: () =>
            reconstructed.receiveCommand({
              id: 'cmd_exhausted_final',
              commandName: 'increment',
              serviceIndex: 3,
              dispositionChainHash: '3'.repeat(64),
              failure: null,
              delta: {
                upserted: [{ ...foreignResource, amount: 999 }],
                deleted: [],
              },
            }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedFinal)) {
          throw new Error('Expected exhausted final append to refuse');
        }
        expect(Cause.squash(exhaustedFinal.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(reconstructed.status()).toMatchObject({ blockedWork: true });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              reconstructed.db.select().from(serviceNodeCommands),
              reconstructed.db.select().from(serviceNodeMetadata),
              reconstructed.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([
          appendBoundaryHistory,
          [{ ...committedMetadata[0]!, admittedThroughPushIndex: 2 }],
          committedResources,
        ]);
        // With no selected finals, append and producer coordinates can reach the same bound.
        const producerStorage = yield* openTestDb({});
        const producerView = yield* Effect.promise(() =>
          makeServiceNodeOptimisticView({
            sessionDefinition: definition,
            openMemory,
            runSync: Effect.runSyncWith(context),
          }),
        );
        const producerNode = new ServiceNode(
          nodeDb(producerStorage.db.$client),
          node.definition,
          producerView,
          definition,
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => producerNode.close()),
        );
        yield* Effect.promise(() => producerNode.initialize());
        yield* Effect.promise(() =>
          producerNode.initializeBaseline({
            serviceIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [baselineResource],
          }),
        );
        const producerFirst = yield* Effect.promise(() =>
          producerNode.accept(commandB),
        );
        yield* Effect.promise(() =>
          producerNode.db
            .update(serviceNodeCommands)
            .set({
              nodeIndex: Number.MAX_SAFE_INTEGER - 2,
              pushIndex: Number.MAX_SAFE_INTEGER - 2,
            })
            .where(eq(serviceNodeCommands.sessionIndex, commandB.sessionIndex)),
        );
        const producerMetadata = yield* Effect.promise(() =>
          producerNode.db.select().from(serviceNodeMetadata),
        );
        const producerResources = yield* Effect.promise(() =>
          producerNode.db.select().from(counterV1.drizzleSchema),
        );
        const producerBoundaryCommand = {
          ...commandB,
          sessionIndex: 3,
        };
        const lastProducer = yield* Effect.promise(() =>
          producerNode.accept(producerBoundaryCommand),
        );
        expect(lastProducer).toEqual({
          sessionId: producerBoundaryCommand.sessionId,
          sessionIndex: producerBoundaryCommand.sessionIndex,
          pushIndex: Number.MAX_SAFE_INTEGER - 1,
          nodeId: producerFirst.nodeId,
          nodeIndex: Number.MAX_SAFE_INTEGER - 1,
        });
        const producerHistory = yield* Effect.promise(() =>
          producerNode.db.select().from(serviceNodeCommands),
        );
        expect(
          producerHistory.map(row => ({
            nodeIndex: row.nodeIndex,
            pushIndex: row.pushIndex,
            serviceIndex: row.serviceIndex,
          })),
        ).toEqual([
          {
            nodeIndex: Number.MAX_SAFE_INTEGER - 2,
            pushIndex: Number.MAX_SAFE_INTEGER - 2,
            serviceIndex: null,
          },
          {
            nodeIndex: Number.MAX_SAFE_INTEGER - 1,
            pushIndex: Number.MAX_SAFE_INTEGER - 1,
            serviceIndex: null,
          },
        ]);
        const exhaustedProducer = yield* Effect.tryPromise({
          try: () => producerNode.accept({ ...commandB, sessionIndex: 4 }),
          catch: error => error,
        }).pipe(Effect.exit);
        if (Exit.isSuccess(exhaustedProducer)) {
          throw new Error('Expected exhausted producer allocation to refuse');
        }
        expect(Cause.squash(exhaustedProducer.cause)).toMatchObject({
          code: 'node-index-invalid',
        });
        expect(
          yield* Effect.promise(() =>
            producerNode.accept(producerBoundaryCommand),
          ),
        ).toEqual(lastProducer);
        expect(
          yield* Effect.promise(() => producerNode.accept(commandB)),
        ).toEqual({
          ...producerFirst,
          nodeIndex: Number.MAX_SAFE_INTEGER - 2,
          pushIndex: Number.MAX_SAFE_INTEGER - 2,
        });
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              producerNode.db.select().from(serviceNodeCommands),
              producerNode.db.select().from(serviceNodeMetadata),
              producerNode.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual([producerHistory, producerMetadata, producerResources]);
      }),
  );
});

describe('Session composition', () => {
  it.effect(
    'cancels unfinished connection acquisition through its owning Scope',
    () =>
      Effect.gen(function* () {
        const acquiring = Promise.withResolvers<void>();
        const aborted = vi.fn();
        let acquiringSignal: AbortSignal | undefined;
        const acquire = vi
          .spyOn(workerPorts, 'acquireWorkerPort')
          .mockImplementation(
            async ({ signal }) =>
              new Promise<never>((_resolve, reject) => {
                acquiringSignal = signal;
                signal.addEventListener(
                  'abort',
                  () => {
                    aborted();
                    reject(makeZerospinError('node-tab-detached'));
                  },
                  { once: true },
                );
                acquiring.resolve();
              }),
          );
        const onProtocolFailure = vi.fn();
        const view = vi.fn(async () => {});
        const replica: IAggregateReplica = {
          pendingCommands: () => [],
          view,
          reset: async () => {},
          state: () => {},
          attachmentReady: async () => {},
          connectionFailed: vi.fn(),
          recoveryWarning: vi.fn(),
        };
        try {
          const connection = makeStandaloneAggregateConnection({
            signal: new AbortController().signal,
            sharedWorkerUrl: 'https://zerospin.test/session.js',
            key: 'scope-owned',
            attachment: {},
            onProtocolFailure,
          });
          const startup = yield* connection
            .start(replica)
            .pipe(Effect.scoped, Effect.forkChild);
          yield* Effect.promise(() => acquiring.promise);
          yield* Fiber.interrupt(startup);
          expect(acquiringSignal?.aborted).toBe(true);
          expect(aborted).toHaveBeenCalledTimes(1);
          expect(view).not.toHaveBeenCalled();
          expect(onProtocolFailure).not.toHaveBeenCalled();
          expect(connection.stagedCommandAttachment('node_test')).toBeNull();
        } finally {
          acquire.mockRestore();
        }
      }),
  );

  it('constructs all three concrete connections without starting transport or authentication', () => {
    const controller = new AbortController();
    const observeAbort = vi.spyOn(controller.signal, 'addEventListener');
    const getAdmission = vi.fn(async () => {
      throw new Error('Cold construction cannot request admission');
    });
    const common = {
      signal: controller.signal,
      sharedWorkerUrl: 'https://zerospin.test/session.js',
      onProtocolFailure: vi.fn(),
    };
    const aggregate = makeConnectedAggregateConnection({
      ...common,
      aggregateId: 'gam_cold',
      getAdmission,
      request: {
        apiUrl: 'https://zerospin.test',
        publishableKey: 'pk_test',
        systemName: gameSessionDefinition.systemName,
        aggregateName: gameSessionDefinition.aggregateName,
        aggregateVersion: gameSessionDefinition.aggregateVersion,
        sessionName: gameSessionDefinition.sessionName,
        lock: makeAggregateSessionSpec(gameSessionDefinition)
          .aggregateSessionLock,
      },
    });
    const service = makeConnectedServiceConnection({
      ...common,
      getAdmission,
      request: {
        apiUrl: 'https://zerospin.test',
        publishableKey: 'pk_test',
        systemName: catalogSessionDefinition.systemName,
        serviceName: catalogSessionDefinition.serviceName,
        serviceVersion: catalogSessionDefinition.serviceVersion,
        sessionName: catalogSessionDefinition.sessionName,
        lock: makeServiceSessionSpec(catalogSessionDefinition)
          .serviceSessionLock,
      },
    });
    const standalone = makeStandaloneAggregateConnection({
      ...common,
      key: 'local',
      attachment: {},
    });
    expect(aggregate.stagedCommandAttachment('node_test')).toBeNull();
    expect(service.stagedCommandAttachment('node_test')).toBeNull();
    expect(standalone.stagedCommandAttachment('node_test')).toBeNull();
    expect(standalone.journalIdentityKey?.()).toBe('local');
    expect(getAdmission).not.toHaveBeenCalled();
    expect(observeAbort).not.toHaveBeenCalled();
    observeAbort.mockRestore();
  });

  it.effect(
    'keeps early staging pending until attachment readiness and fences retired replies',
    () =>
      Effect.gen(function* () {
        const command = Schema.decodeUnknownSync(AggregateNodeCommandSchema)({
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_composition',
          sessionIndex: 1,
          kind: 'actor',
          aggregateId: 'gam_composition',
          aggregateName: gameSessionDefinition.aggregateName,
          aggregateVersion: gameSessionDefinition.aggregateVersion,
          actorName: gameSessionDefinition.actorName,
          actorVersion: gameSessionDefinition.actorVersion,
          sessionName: gameSessionDefinition.sessionName,
          commandName: 'createGame',
          contractVersion: 1,
          claims: {
            aggregateId: 'gam_composition',
            instanceId: 'gam_composition',
          },
          payload: '{"id":"gam_composition"}',
          stagingOutcome: {
            result: null,
            completedAt: '2026-10-27T00:00:00.000Z',
          },
        });
        let pending = [command];
        let available = false;
        let current = true;
        const retained: INodeRetention[] = [];
        const reportFailure = vi.fn();
        const firstOffered = Promise.withResolvers<void>();
        const secondOffered = Promise.withResolvers<void>();
        const firstReply = Promise.withResolvers<readonly INodeRetention[]>();
        const secondReply = Promise.withResolvers<readonly INodeRetention[]>();
        const subscriber = makeOutboxSubscriber({
          schema: AggregateNodeCommandSchema,
          check: () => {},
          receive: async commands => {
            if (commands[0]?.sessionIndex === 1) {
              firstOffered.resolve();
              return firstReply.promise;
            }
            if (commands[0]?.sessionIndex === 2) {
              secondOffered.resolve();
              return secondReply.promise;
            }
            return [
              {
                ...firstRetention,
                sessionIndex: 4,
                nodeIndex: 2,
                pushIndex: 2,
              },
            ];
          },
        });
        const handoff = yield* makeSessionCommandHandoff({
          readPending: () => pending,
          prepare: row => Effect.succeed(row),
          attachment: () =>
            available
              ? {
                  subscriber: async () => subscriber,
                  isCurrent: () => current,
                }
              : null,
          retainCoordinates: records =>
            Effect.sync(() => {
              retained.push(...records);
              pending = pending.filter(
                row =>
                  !records.some(
                    record => record.sessionIndex === row.sessionIndex,
                  ),
              );
            }),
          reportFailure,
          isActive: () => true,
          context: Context.empty(),
          originating: () => {},
          changed: () => {},
        });
        handoff.observe();
        yield* Effect.yieldNow;
        expect(pending).toHaveLength(1);
        expect(retained).toHaveLength(0);
        available = true;
        handoff.wake();
        yield* Effect.promise(() => firstOffered.promise);
        const firstRetention = {
          sessionId: command.sessionId,
          sessionIndex: 1,
          nodeId: 'node_composition',
          nodeIndex: 1,
          pushIndex: 1,
        };
        firstReply.resolve([firstRetention]);
        yield* Effect.promise(() => handoff.waitForRetention(1));
        expect(retained).toEqual([firstRetention]);

        pending = [{ ...command, sessionIndex: 2 }];
        handoff.observe();
        yield* Effect.promise(() => secondOffered.promise);
        const waiting = handoff.waitForRetention(2).catch(error => error);
        current = false;
        handoff.reset();
        secondReply.resolve([
          { ...firstRetention, sessionIndex: 2, nodeIndex: 0, pushIndex: 2 },
        ]);
        expect(yield* Effect.promise(() => waiting)).toMatchObject({
          code: 'outbox-source-replaced',
        });
        // Let the obsolete acknowledgement content settle before replacing transport.
        yield* Effect.promise(() => setImmediate());
        expect(retained).toEqual([firstRetention]);
        expect(pending).toHaveLength(1);

        const thirdOffered = Promise.withResolvers<void>();
        const thirdReply =
          Promise.withResolvers<
            Awaited<ReturnType<typeof subscriber.receive>>
          >();
        const receive = vi
          .spyOn(subscriber, 'receive')
          .mockImplementationOnce(async () => {
            thirdOffered.resolve();
            return thirdReply.promise;
          });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => receive.mockRestore()),
        );
        current = true;
        pending = [{ ...command, sessionIndex: 3 }];
        handoff.observe();
        yield* Effect.promise(() => thirdOffered.promise);
        const retiredWaiting = handoff
          .waitForRetention(3)
          .catch(error => error);
        handoff.reset();
        expect(yield* Effect.promise(() => retiredWaiting)).toMatchObject({
          code: 'outbox-source-replaced',
        });
        pending = [{ ...command, sessionIndex: 4 }];
        const replacementWaiting = handoff
          .waitForRetention(4)
          .catch(error => error);
        handoff.observe();
        thirdReply.reject(new Error('Retired transport rejected'));
        expect(yield* Effect.promise(() => replacementWaiting)).toBeUndefined();
        yield* handoff.dispose;
        expect(retained).toEqual([
          firstRetention,
          { ...firstRetention, sessionIndex: 4, nodeIndex: 2, pushIndex: 2 },
        ]);
        expect(pending).toHaveLength(0);
        expect(reportFailure).not.toHaveBeenCalled();
      }),
  );
});
