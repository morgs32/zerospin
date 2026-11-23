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
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
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

describe('Final resolution before the retention reply reaches a replica', () => {
  it.effect(
    'Aggregate settles the original once and preserves a newer local overlay',
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
              if (row === undefined) {
                throw new Error('Missing seeded counter');
              }
              yield* operations.update({
                resourceId: row.id,
                attributes: { amount: row.amount + 1 },
              });
              return row.amount + 1;
            }),
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'finalReply' }),
          {
            version: 1,
            models,
            system: { increment },
            actors: {},
          },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'finalReply',
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
              apiUrl: 'https://final-reply.example',
              publishableKey: 'pub_final_reply',
              systemName: definition.systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              aggregateId: 'finalReply',
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { aggregateId: 'finalReply' },
              definitionHash: 'finalReply',
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
            resources: [baselineResource],
          }),
        );
        const origin = yield* openReplica(aggregateSessionRepoDbConfig.tables);
        const sessionId = 'sesn_origin' as const;
        yield* installAggregateNodeView({
          db: origin,
          definition,
          sessionId,
          snapshot: yield* Effect.promise(() => node.snapshot()),
        });
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition: definition,
          db: origin,
          admitted: {
            sessionId,
            aggregateId: 'finalReply',
            actorName: 'member',
            actorVersion: 1,
            claims: { aggregateId: 'finalReply' },
          },
        });
        const stagedA = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'increment',
          contract: increment,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('a')));
        const commandA = {
          ...Schema.encodeSync(SessionSubmissionSchema)(
            yield* encodeCommand({ contract: increment, command: stagedA }),
          ),
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        };
        const { commands, sessionMetadata } =
          aggregateSessionRepoDbConfig.schema;
        const originalA = origin.select().from(commands).get()!;
        expect(stagedA.stagingOutcome.result).toBe(1);
        expect(originalA).toMatchObject({
          sessionIndex: commandA.sessionIndex,
          nodeId: null,
          nodeIndex: null,
          aggregateIndex: null,
        });
        // Hold the returned coordinates: the local replica has not observed this reply.
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const retainedOriginal = (yield* Effect.promise(() =>
          node.db.select().from(aggregateNodeCommands),
        ))[0]!;
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'increment',
            aggregateIndex: 1,
            dispositionChainHash: finalHash,
            failure: null,
            delta: { upserted: [], deleted: [] },
          }),
        );
        expect(origin.select().from(commands).all()).toEqual([originalA]);
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        const captured = yield* Effect.promise(() =>
          node.snapshot({
            pendingCommands: [commandA],
          }),
        );
        expect(captured).toMatchObject({
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          metadata: { aggregateIndex: 1, admittedThroughPushIndex: 1 },
          resources: [{ amount: 0 }],
        });
        expect(captured.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            commandName: 'increment',
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
            resolution: {
              id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
              commandName: 'increment',
              aggregateIndex: 1,
              failure: null,
            },
          },
        ]);
        // B did not exist when this final view was captured and still sees A's local optimism.
        const stagedB = yield* stageAggregateSessionCommandTx(origin, {
          initialized,
          contractName: 'increment',
          contract: increment,
          payload: {},
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const originalB = origin
          .select()
          .from(commands)
          .all()
          .find(row => row.sessionIndex === 2)!;
        expect(stagedB.stagingOutcome.result).toBe(2);
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        yield* installAggregateNodeView({
          db: origin,
          definition,
          sessionId,
          snapshot: captured,
        });
        const settled = origin.select().from(commands).all();
        expect(settled).toHaveLength(2);
        expect(
          settled.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
          aggregateIndex: 1,
          inverseOperations: null,
        });
        const replayedB = settled.find(
          row => row.sessionIndex === originalB.sessionIndex,
        )!;
        expect({
          ...replayedB,
          inverseOperations: originalB.inverseOperations,
        }).toEqual(originalB);
        expect(replayedB.inverseOperations).not.toBeNull();
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(origin.select().from(sessionMetadata).all()).toEqual([
          {
            sessionId,
            lastSessionIndex: 2,
            afterNodeIndex: 2,
            aggregateIndex: 1,
            dispositionChainHash: finalHash,
          },
        ]);
        const readNodeStorage = () =>
          Promise.all([
            node.db.select().from(aggregateNodeCommands),
            node.db.select().from(aggregateNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]);
        const durableBeforeRetry = yield* Effect.promise(readNodeStorage);
        expect(durableBeforeRetry[0]).toHaveLength(2);
        expect(durableBeforeRetry[0][0]).toEqual(retainedOriginal);
        const replicaBeforeRetry = [
          settled,
          origin.select().from(sessionMetadata).all(),
          origin.select().from(counterV1.drizzleSchema).all(),
        ];
        expect(yield* Effect.promise(() => node.accept(commandA))).toEqual(
          retainedA,
        );
        expect(yield* Effect.promise(readNodeStorage)).toEqual(
          durableBeforeRetry,
        );
        expect([
          origin.select().from(commands).all(),
          origin.select().from(sessionMetadata).all(),
          origin.select().from(counterV1.drizzleSchema).all(),
        ]).toEqual(replicaBeforeRetry);
      }),
  );

  it.effect(
    'Service settles the original once and preserves a newer local overlay',
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
              if (row === undefined) {
                throw new Error('Missing seeded counter');
              }
              yield* operations.update({
                resourceId: row.id,
                attributes: { amount: row.amount + 1 },
              });
              return row.amount + 1;
            }),
          },
        );
        const release = makeServiceRelease(
          defineService({ name: 'finalReply' }),
          { version: 1, models, system: { increment } },
        );
        const definition = makeServiceSessionDefinition({
          systemName: 'finalReply',
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
              apiUrl: 'https://final-reply.example',
              publishableKey: 'pub_final_reply',
              systemName: definition.systemName,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { memberId: 'member' },
              definitionHash: 'finalReply',
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
            resources: [baselineResource],
          }),
        );
        const origin = yield* openReplica(serviceSessionRepoDbConfig.tables);
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: yield* Effect.promise(() => node.snapshot()),
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
        const { commands, serviceSessionMetadata } =
          serviceSessionRepoDbConfig.schema;
        const originalA = origin.select().from(commands).get()!;
        expect(stagedA.result).toBe(1);
        expect(originalA).toMatchObject({
          sessionIndex: commandA.sessionIndex,
          nodeId: null,
          nodeIndex: null,
          serviceIndex: null,
        });
        // Hold the returned coordinates: the local replica has not observed this reply.
        const retainedA = yield* Effect.promise(() => node.accept(commandA));
        const retainedOriginal = (yield* Effect.promise(() =>
          node.db.select().from(serviceNodeCommands),
        ))[0]!;
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'increment',
            serviceIndex: 1,
            dispositionChainHash: finalHash,
            failure: null,
            delta: { upserted: [], deleted: [] },
          }),
        );
        expect(origin.select().from(commands).all()).toEqual([originalA]);
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        const captured = yield* Effect.promise(() =>
          node.snapshot({
            pendingCommands: [commandA],
          }),
        );
        expect(captured).toMatchObject({
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          metadata: { serviceIndex: 1, admittedThroughPushIndex: 1 },
          resources: [{ amount: 0 }],
        });
        expect(captured.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            commandName: 'increment',
            nodeId: retainedA.nodeId,
            nodeIndex: retainedA.nodeIndex,
            pushIndex: retainedA.pushIndex,
            resolution: {
              id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
              commandName: 'increment',
              serviceIndex: 1,
              failure: null,
            },
          },
        ]);
        // B did not exist when this final view was captured and still sees A's local optimism.
        const stagedB = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          contract: increment,
          payload: {},
          claims: { memberId: 'member' },
        }).pipe(Effect.provideService(CuidFactory, () => Effect.succeed('b')));
        const originalB = origin
          .select()
          .from(commands)
          .all()
          .find(row => row.sessionIndex === 2)!;
        expect(stagedB.result).toBe(2);
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 2 });
        yield* installServiceNodeView({
          sessionId: 'sesn_origin',
          db: origin,
          definition,
          snapshot: captured,
        });
        const settled = origin.select().from(commands).all();
        expect(settled).toHaveLength(2);
        expect(
          settled.find(row => row.sessionIndex === commandA.sessionIndex),
        ).toEqual({
          ...originalA,
          nodeId: retainedA.nodeId,
          nodeIndex: retainedA.nodeIndex,
          pushIndex: retainedA.pushIndex,
          serviceIndex: 1,
          inverseOperations: null,
        });
        const replayedB = settled.find(
          row => row.sessionIndex === originalB.sessionIndex,
        )!;
        expect({
          ...replayedB,
          inverseOperations: originalB.inverseOperations,
        }).toEqual(originalB);
        expect(replayedB.inverseOperations).not.toBeNull();
        expect(
          origin.select().from(counterV1.drizzleSchema).get(),
        ).toMatchObject({ amount: 1 });
        expect(origin.select().from(serviceSessionMetadata).all()).toEqual([
          {
            lastSessionIndex: 2,
            afterNodeIndex: 2,
            serviceIndex: 1,
            dispositionChainHash: finalHash,
          },
        ]);
        const readNodeStorage = () =>
          Promise.all([
            node.db.select().from(serviceNodeCommands),
            node.db.select().from(serviceNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]);
        const durableBeforeRetry = yield* Effect.promise(readNodeStorage);
        expect(durableBeforeRetry[0]).toHaveLength(2);
        expect(durableBeforeRetry[0][0]).toEqual(retainedOriginal);
        const replicaBeforeRetry = [
          settled,
          origin.select().from(serviceSessionMetadata).all(),
          origin.select().from(counterV1.drizzleSchema).all(),
        ];
        expect(yield* Effect.promise(() => node.accept(commandA))).toEqual(
          retainedA,
        );
        expect(yield* Effect.promise(readNodeStorage)).toEqual(
          durableBeforeRetry,
        );
        expect([
          origin.select().from(commands).all(),
          origin.select().from(serviceSessionMetadata).all(),
          origin.select().from(counterV1.drizzleSchema).all(),
        ]).toEqual(replicaBeforeRetry);
      }),
  );
});
