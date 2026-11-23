import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@effect/vitest';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import { SessionSubmissionSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { installAggregateNodeView } from '@zerospin/core/aggregateSession/installAggregateNodeView';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import { stageAggregateSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx';
import * as operationApplication from '@zerospin/core/contracts/applyOperationTx';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
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
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { CuidFactory, primitives, type IAnyTables } from '@zerospin/shapes';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

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
const first = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_first',
  amount: 0,
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
};
const second = { ...first, id: 'cnt_second' };

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

describe('Expected replay refusal preserves pending originals', () => {
  it.effect(
    'Aggregate keeps refused originals pending and reactivates them after a later baseline',
    () =>
      Effect.gen(function* () {
        const contract = makeAggregateContractRelease(
          defineAggregateContract('incrementPair'),
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
            program: Effect.fn('aggregateIncrementPair.program')(function* ({
              db,
              operations,
            }) {
              const current = yield* findFirst({
                db,
                model: db.models.counter,
                where: { id: { eq: 'cnt_first' } },
              });
              if (current === undefined) {
                throw new Error('Missing first counter');
              }
              yield* operations.update({
                resourceId: 'cnt_first',
                attributes: { amount: current.amount + 1 },
              });
              yield* operations.update({
                resourceId: 'cnt_second',
                attributes: { amount: 9 },
              });
              return current.amount + 1;
            }),
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'replay' }),
          {
            version: 1,
            models,
            system: { incrementPair: contract },
            actors: {},
          },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'replay',
          aggregateName: release.name,
          aggregateVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'pair',
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        const context = yield* Effect.context<never>();
        const scratchClient = yield* Effect.promise(openMemory);
        const scratch = makeSqliteDrizzle(
          scratchClient,
          makeResourceDbConfig({ models }),
        );
        const view = yield* Effect.promise(() =>
          makeAggregateNodeOptimisticView({
            sessionDefinition: definition,
            openMemory: () => Promise.resolve(scratchClient),
            runSync: Effect.runSyncWith(context),
          }),
        );
        const node = new AggregateNode(
          nodeDb(storage.db.$client),
          {
            identity: {
              apiUrl: 'https://replay.example',
              publishableKey: 'pub_replay',
              systemName: definition.systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              aggregateId: 'replay',
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { aggregateId: 'replay' },
              definitionHash: 'replay',
            },
            lock: makeAggregateSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
        yield* Effect.promise(() => node.initialize());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [first, second],
          }),
        );
        const origin = yield* openReplica(aggregateSessionRepoDbConfig.tables);
        const sessionId = 'sesn_pair' as const;
        const initial = yield* Effect.promise(() => node.snapshot());
        yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: initial,
          sessionId,
        });
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition: definition,
          db: origin,
          admitted: {
            sessionId,
            aggregateId: 'replay',
            actorName: 'member',
            actorVersion: 1,
            claims: { aggregateId: 'replay' },
          },
        });
        const stagedA = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'incrementPair',
          contract,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('a')));
        const commandA = {
          ...Schema.encodeSync(SessionSubmissionSchema)(
            yield* encodeCommand({ contract, command: stagedA }),
          ),
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        };
        const stagedB = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'incrementPair',
          contract,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const commandB = {
          ...Schema.encodeSync(SessionSubmissionSchema)(
            yield* encodeCommand({ contract, command: stagedB }),
          ),
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        };
        const originalRows = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        expect(originalRows.map(row => row.inverseOperations === null)).toEqual(
          [false, false],
        );
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([
          { id: 'cnt_first', amount: 2 },
          { id: 'cnt_second', amount: 9 },
        ]);
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const active = yield* Effect.promise(() => node.snapshot());
        expect(active.resources).toMatchObject([
          { id: 'cnt_first', amount: 1 },
          { id: 'cnt_second', amount: 9 },
        ]);
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_delete_second',
            commandName: 'foreignChange',
            aggregateIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            failure: null,
            delta: {
              upserted: [],
              deleted: [{ modelName: 'counter', id: 'cnt_second' }],
            },
          }),
        );
        const nodeBeforeRefusal = yield* Effect.promise(() =>
          Promise.all([
            node.db.select().from(aggregateNodeCommands),
            node.db.select().from(aggregateNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]),
        );
        const pendingCommands = [commandA, commandB];
        // Observe the actual first SQL write; the missing second row raises the real expected refusal.
        const applied = operationApplication.applyOperationTx;
        const writtenViews: string[] = [];
        const probe = vi
          .spyOn(operationApplication, 'applyOperationTx')
          .mockImplementation(input =>
            Effect.gen(function* () {
              const result = yield* applied(input);
              if (input.operation.resourceId === 'cnt_first') {
                const resources = writtenViews.length === 0 ? scratch : origin;
                expect(
                  resources.select().from(counterV1.drizzleSchema).get(),
                ).toMatchObject({ id: 'cnt_first', amount: 1 });
                writtenViews.push(
                  writtenViews.length === 0 ? 'Node' : 'Session',
                );
              }
              return result;
            }),
          );
        const refused = yield* Effect.gen(function* () {
          const snapshot = yield* Effect.promise(() =>
            node.snapshot({ pendingCommands }),
          );
          expect(snapshot.resources).toEqual([first]);
          expect(
            scratch.select().from(counterV1.drizzleSchema).all(),
          ).toMatchObject([{ id: 'cnt_first', amount: 0 }]);
          yield* installAggregateNodeView({
            db: origin,
            definition,
            snapshot,
            sessionId,
          });
          return snapshot;
        }).pipe(Effect.ensuring(Effect.sync(() => probe.mockRestore())));
        expect(writtenViews).toEqual(['Node', 'Session']);
        expect(refused).toMatchObject({
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 0,
          metadata: { aggregateIndex: 1, admittedThroughPushIndex: 0 },
          state: { localAvailability: 'available', blockedWork: false },
        });
        expect(refused.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            commandName: 'incrementPair',
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
            resolution: null,
          },
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            commandName: 'incrementPair',
            nodeId: null,
            nodeIndex: null,
            pushIndex: null,
            resolution: null,
          },
        ]);
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([{ id: 'cnt_first', amount: 0 }]);
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toHaveLength(1);
        const refusedRows = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        expect(refusedRows).toEqual(
          originalRows.map((row, index) => ({
            ...row,
            inverseOperations: null,
            nodeId: index === 0 ? retainedA.nodeId : null,
            nodeIndex: index === 0 ? retainedA.nodeIndex : null,
            pushIndex: index === 0 ? retainedA.pushIndex : null,
          })),
        );
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(aggregateNodeCommands),
              node.db.select().from(aggregateNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual(nodeBeforeRefusal);
        // Restoring the second resource lets both unchanged originals become active against a different baseline.
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_restore_second',
            commandName: 'foreignChange',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...first, amount: 10 }, second],
              deleted: [],
            },
          }),
        );
        const resumed = yield* Effect.promise(() =>
          node.snapshot({ pendingCommands }),
        );
        expect(resumed.resources).toMatchObject([
          { id: 'cnt_first', amount: 11 },
          { id: 'cnt_second', amount: 9 },
        ]);
        expect(resumed).toMatchObject({
          nodeIndex: 3,
          pushIndex: 1,
          outcomeIndex: 0,
          metadata: { aggregateIndex: 2, admittedThroughPushIndex: 0 },
          state: { localAvailability: 'available', blockedWork: false },
        });
        yield* installAggregateNodeView({
          db: origin,
          definition,
          snapshot: resumed,
          sessionId,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([
          { id: 'cnt_first', amount: 12 },
          { id: 'cnt_second', amount: 9 },
        ]);
        const resumedRows = origin
          .select()
          .from(aggregateSessionRepoDbConfig.schema.commands)
          .all();
        expect(resumedRows[0]).toEqual(refusedRows[0]);
        expect(resumedRows[1]).toEqual({
          ...refusedRows[1],
          inverseOperations: resumedRows[1]!.inverseOperations,
        });
        const decodedB =
          yield* aggregateSessionRepoDbConfig.tables.commands.decodeRow(
            resumedRows[1]!,
          );
        expect(decodedB.inverseOperations).toHaveLength(2);
        const decodedFirst = yield* counterV1.table.decodeRow(
          origin.select().from(counterV1.drizzleSchema).get()!,
        );
        expect(decodedFirst.updatedAt).toEqual(
          decodedB.stagingOutcome.completedAt,
        );
        expect(yield* Effect.promise(() => node.accept(commandA))).toEqual(
          retainedA,
        );
        const retainedRows = yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeCommands),
        );
        expect(retainedRows).toHaveLength(3);
        expect(
          retainedRows.filter(
            row => row.sessionIndex === commandA.sessionIndex,
          ),
        ).toEqual([nodeBeforeRefusal[0][0]]);
        expect(
          origin
            .select()
            .from(aggregateSessionRepoDbConfig.schema.sessionMetadata)
            .get(),
        ).toMatchObject({
          afterNodeIndex: 3,
          aggregateIndex: 2,
          dispositionChainHash: '2'.repeat(64),
        });
      }),
  );

  it.effect(
    'Service keeps refused originals pending and reactivates them after a later baseline',
    () =>
      Effect.gen(function* () {
        const contract = makeServiceContractRelease(
          defineServiceContract('incrementPair'),
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
            program: Effect.fn('serviceIncrementPair.program')(function* ({
              db,
              operations,
            }) {
              const current = yield* findFirst({
                db,
                model: db.models.counter,
                where: { id: { eq: 'cnt_first' } },
              });
              if (current === undefined) {
                throw new Error('Missing first counter');
              }
              yield* operations.update({
                resourceId: 'cnt_first',
                attributes: { amount: current.amount + 1 },
              });
              yield* operations.update({
                resourceId: 'cnt_second',
                attributes: { amount: 9 },
              });
              return current.amount + 1;
            }),
          },
        );
        const release = makeServiceRelease(defineService({ name: 'replay' }), {
          version: 1,
          models,
          system: { incrementPair: contract },
        });
        const definition = makeServiceSessionDefinition({
          systemName: 'replay',
          serviceName: release.name,
          serviceVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'pair',
          claimsSchema: Schema.Struct({}),
          models: release.models,
          contracts: release.contracts,
        });
        const storage = yield* openTestDb({});
        const context = yield* Effect.context<never>();
        const scratchClient = yield* Effect.promise(openMemory);
        const scratch = makeSqliteDrizzle(
          scratchClient,
          makeResourceDbConfig({ models }),
        );
        const view = yield* Effect.promise(() =>
          makeServiceNodeOptimisticView({
            sessionDefinition: definition,
            openMemory: () => Promise.resolve(scratchClient),
            runSync: Effect.runSyncWith(context),
          }),
        );
        const node = new ServiceNode(
          nodeDb(storage.db.$client),
          {
            identity: {
              apiUrl: 'https://replay.example',
              publishableKey: 'pub_replay',
              systemName: definition.systemName,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,

              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: {},
              definitionHash: 'replay',
            },
            lock: makeServiceSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
        yield* Effect.promise(() => node.initialize());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            serviceIndex: 0,
            dispositionChainHash: genesisHash,
            resolvedThrough: 0,
            resources: [first, second],
          }),
        );
        const origin = yield* openReplica(serviceSessionRepoDbConfig.tables);
        const initial = yield* Effect.promise(() => node.snapshot());
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: initial,
        });

        const stagedA = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          contract,
          payload: {},
          claims: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('a')));
        const commandA = stagedA.command;
        const stagedB = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          contract,
          payload: {},
          claims: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const commandB = stagedB.command;
        const originalRows = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        expect(originalRows.map(row => row.inverseOperations === null)).toEqual(
          [false, false],
        );
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([
          { id: 'cnt_first', amount: 2 },
          { id: 'cnt_second', amount: 9 },
        ]);
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const active = yield* Effect.promise(() => node.snapshot());
        expect(active.resources).toMatchObject([
          { id: 'cnt_first', amount: 1 },
          { id: 'cnt_second', amount: 9 },
        ]);
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_delete_second',
            commandName: 'foreignChange',
            serviceIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            failure: null,
            delta: {
              upserted: [],
              deleted: [{ modelName: 'counter', id: 'cnt_second' }],
            },
          }),
        );
        const nodeBeforeRefusal = yield* Effect.promise(() =>
          Promise.all([
            node.db.select().from(serviceNodeCommands),
            node.db.select().from(serviceNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]),
        );
        const pendingCommands = [commandA, commandB];
        // Observe the actual first SQL write; the missing second row raises the real expected refusal.
        const applied = operationApplication.applyOperationTx;
        const writtenViews: string[] = [];
        const probe = vi
          .spyOn(operationApplication, 'applyOperationTx')
          .mockImplementation(input =>
            Effect.gen(function* () {
              const result = yield* applied(input);
              if (input.operation.resourceId === 'cnt_first') {
                const resources = writtenViews.length === 0 ? scratch : origin;
                expect(
                  resources.select().from(counterV1.drizzleSchema).get(),
                ).toMatchObject({ id: 'cnt_first', amount: 1 });
                writtenViews.push(
                  writtenViews.length === 0 ? 'Node' : 'Session',
                );
              }
              return result;
            }),
          );
        const refused = yield* Effect.gen(function* () {
          const snapshot = yield* Effect.promise(() =>
            node.snapshot({ pendingCommands }),
          );
          expect(snapshot.resources).toEqual([first]);
          expect(
            scratch.select().from(counterV1.drizzleSchema).all(),
          ).toMatchObject([{ id: 'cnt_first', amount: 0 }]);
          yield* installServiceNodeView({
            sessionId: 'sesn_origin',
            db: origin,
            definition,
            snapshot,
          });
          return snapshot;
        }).pipe(Effect.ensuring(Effect.sync(() => probe.mockRestore())));
        expect(writtenViews).toEqual(['Node', 'Session']);
        expect(refused).toMatchObject({
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 0,
          metadata: { serviceIndex: 1, admittedThroughPushIndex: 0 },
          state: { localAvailability: 'available', blockedWork: false },
        });
        expect(refused.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            commandName: 'incrementPair',
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
            resolution: null,
          },
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            commandName: 'incrementPair',
            nodeId: null,
            nodeIndex: null,
            pushIndex: null,
            resolution: null,
          },
        ]);
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([{ id: 'cnt_first', amount: 0 }]);
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toHaveLength(1);
        const refusedRows = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        expect(refusedRows).toEqual(
          originalRows.map((row, index) => ({
            ...row,
            inverseOperations: null,
            nodeId: index === 0 ? retainedA.nodeId : null,
            nodeIndex: index === 0 ? retainedA.nodeIndex : null,
            pushIndex: index === 0 ? retainedA.pushIndex : null,
          })),
        );
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(serviceNodeCommands),
              node.db.select().from(serviceNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual(nodeBeforeRefusal);
        // Restoring the second resource lets both unchanged originals become active against a different baseline.
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_restore_second',
            commandName: 'foreignChange',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...first, amount: 10 }, second],
              deleted: [],
            },
          }),
        );
        const resumed = yield* Effect.promise(() =>
          node.snapshot({ pendingCommands }),
        );
        expect(resumed.resources).toMatchObject([
          { id: 'cnt_first', amount: 11 },
          { id: 'cnt_second', amount: 9 },
        ]);
        expect(resumed).toMatchObject({
          nodeIndex: 3,
          pushIndex: 1,
          outcomeIndex: 0,
          metadata: { serviceIndex: 2, admittedThroughPushIndex: 0 },
          state: { localAvailability: 'available', blockedWork: false },
        });
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: resumed,
        });
        expect(
          origin.select().from(counterV1.drizzleSchema).all(),
        ).toMatchObject([
          { id: 'cnt_first', amount: 12 },
          { id: 'cnt_second', amount: 9 },
        ]);
        const resumedRows = origin
          .select()
          .from(serviceSessionRepoDbConfig.schema.commands)
          .all();
        expect(resumedRows[0]).toEqual(refusedRows[0]);
        expect(resumedRows[1]).toEqual({
          ...refusedRows[1],
          inverseOperations: resumedRows[1]!.inverseOperations,
        });
        const decodedB =
          yield* serviceSessionRepoDbConfig.tables.commands.decodeRow(
            resumedRows[1]!,
          );
        expect(decodedB.inverseOperations).toHaveLength(2);
        const decodedFirst = yield* counterV1.table.decodeRow(
          origin.select().from(counterV1.drizzleSchema).get()!,
        );
        expect(decodedFirst.updatedAt).toEqual(
          decodedB.stagingOutcome.completedAt,
        );
        expect(yield* Effect.promise(() => node.accept(commandA))).toEqual(
          retainedA,
        );
        const retainedRows = yield* Effect.promise(() =>
          node.db.select().from(serviceNodeCommands),
        );
        expect(retainedRows).toHaveLength(3);
        expect(
          retainedRows.filter(
            row => row.sessionIndex === commandA.sessionIndex,
          ),
        ).toEqual([nodeBeforeRefusal[0][0]]);
        expect(
          origin
            .select()
            .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
            .get(),
        ).toMatchObject({
          afterNodeIndex: 3,
          serviceIndex: 2,
          dispositionChainHash: '2'.repeat(64),
        });
      }),
  );
});
