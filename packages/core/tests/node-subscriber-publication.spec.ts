import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@effect/vitest';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import {
  AggregateNode,
  type IAggregateNodeSnapshot,
} from '@zerospin/core/AggregateNode/AggregateNode';
import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import type {
  ISqliteClient,
  ISqliteStatementParameter,
} from '@zerospin/core/drizzle/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { INodeRetention } from '@zerospin/core/Node/NodeCommandCoverage';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceNodeOptimisticView } from '@zerospin/core/ServiceNode/makeServiceNodeOptimisticView';
import {
  ServiceNode,
  type IServiceNodeSnapshot,
} from '@zerospin/core/ServiceNode/ServiceNode';
import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from '@zerospin/core/ServiceNode/serviceNodeTables';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { primitives } from '@zerospin/shapes';
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
const baselineResource = {
  modelName: 'counter',
  version: 1,
  id: 'cnt_shared',
  amount: 0,
  createdAt: new Date('2026-10-26T00:00:00.000Z'),
  updatedAt: new Date('2026-10-26T00:00:00.000Z'),
};
const privateFailure = {
  _tag: 'ZerospinError' as const,
  code: 'publication-rejected',
  scope: 'contract' as const,
  message: 'Private A failure',
  status: null,
  extra: { command: 'A' },
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

describe('Node subscriber publication and coalescing', () => {
  it.effect(
    'Aggregate publishes outside SQL and coalesces slow views without losing owned recovery',
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
                fields: ['amount'],
              },
            },
            operations: { update: counterV1.operations.update },
            program: Effect.fn('AggregateIncrement.program')(function* ({
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
          defineAggregate({ name: 'publication' }),
          { version: 1, models, system: { increment }, actors: {} },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'publication',
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
              apiUrl: 'https://publication.example',
              publishableKey: 'pub_publication',
              systemName: definition.systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              aggregateId: 'publication',
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: { aggregateId: 'publication' },
              definitionHash: 'publication',
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
          sessionId: 'sesn_publication' as const,
          sessionIndex: 1,
          commandName: 'increment',
          contractVersion: 1,
          payload: '{}',
          kind: 'actor' as const,
          aggregateName: definition.aggregateName,
          aggregateVersion: definition.aggregateVersion,
          aggregateId: 'publication',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: { aggregateId: 'publication' },
          stagingOutcome: {
            result: 1,
            completedAt: '2026-10-26T01:00:00.000Z',
          },
        } satisfies IAggregateNodeCommand;
        const commandB = {
          ...commandA,
          sessionIndex: 2,
          stagingOutcome: {
            result: 2,
            completedAt: '2026-10-26T01:00:01.000Z',
          },
        };
        let interests: IAggregateNodeCommand[] = [commandA];
        const slowViews: IAggregateNodeSnapshot[] = [];
        const initialReentrant =
          Promise.withResolvers<IAggregateNodeSnapshot>();
        const initialRetention = Promise.withResolvers<INodeRetention>();
        const slowEntered = Promise.withResolvers<IAggregateNodeSnapshot>();
        const releaseSlow = Promise.withResolvers<void>();
        const coalesced = Promise.withResolvers<IAggregateNodeSnapshot>();
        const withNewInterest = Promise.withResolvers<IAggregateNodeSnapshot>();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => releaseSlow.resolve()),
        );
        let held = false;
        const detachSlow = yield* Effect.promise(() =>
          node.subscribe(
            {},
            {
              state: async () => {},
              view: async snapshot => {
                slowViews.push(snapshot);
                if (snapshot.nodeIndex === 0) {
                  // Both calls reenter the Node while its initial view callback is active.
                  initialReentrant.resolve(await node.snapshot());
                  initialRetention.resolve(await node.accept(commandA));
                } else if (snapshot.nodeIndex === 1 && !held) {
                  held = true;
                  slowEntered.resolve(snapshot);
                  await releaseSlow.promise;
                } else if (
                  snapshot.nodeIndex === 4 &&
                  snapshot.commandCoverage.length === 1
                ) {
                  coalesced.resolve(snapshot);
                } else if (
                  snapshot.nodeIndex === 4 &&
                  snapshot.commandCoverage.length === 2
                ) {
                  withNewInterest.resolve(snapshot);
                }
              },
            },
            () => interests,
          ),
        );
        yield* Effect.addFinalizer(() => Effect.sync(detachSlow));
        expect(
          yield* Effect.promise(() => initialReentrant.promise),
        ).toMatchObject({
          nodeIndex: 0,
          resources: [{ amount: 0 }],
        });
        const retainedA = yield* Effect.promise(() => initialRetention.promise);
        const heldView = yield* Effect.promise(() => slowEntered.promise);
        expect(slowViews[0]).toMatchObject({
          nodeIndex: 0,
          resources: [{ amount: 0 }],
          commandCoverage: [
            {
              sessionId: commandA.sessionId,
              sessionIndex: commandA.sessionIndex,
              pushIndex: null,
              nodeId: null,
              nodeIndex: null,
              resolution: null,
            },
          ],
        });
        expect(heldView).toMatchObject({
          nodeIndex: 1,
          resources: [{ amount: 1 }],
          commandCoverage: [
            {
              sessionId: commandA.sessionId,
              sessionIndex: commandA.sessionIndex,
              pushIndex: retainedA.pushIndex,
              nodeId: retainedA.nodeId,
              nodeIndex: 1,
              resolution: null,
            },
          ],
        });
        const fastLatest = Promise.withResolvers<IAggregateNodeSnapshot>();
        const fastViews: IAggregateNodeSnapshot[] = [];
        const detachFast = yield* Effect.promise(() =>
          node.subscribe(
            {},
            {
              state: async () => {},
              view: async snapshot => {
                fastViews.push(snapshot);
                if (snapshot.nodeIndex === 4) {
                  fastLatest.resolve(snapshot);
                }
              },
            },
          ),
        );
        yield* Effect.addFinalizer(() => Effect.sync(detachFast));
        expect(fastViews[0]).toMatchObject({
          nodeIndex: 1,
          resources: [{ amount: 1 }],
          commandCoverage: [],
        });
        // Acceptance and another subscriber keep progressing while the first callback is held.
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'increment',
            aggregateIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            failure: privateFailure,
            delta: { upserted: [], deleted: [] },
          }),
        );
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'foreignChange',
            aggregateIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 20 }],
              deleted: [],
            },
          }),
        );
        expect(yield* Effect.promise(() => fastLatest.promise)).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          resources: [{ amount: 21 }],
          commandCoverage: [],
          metadata: { aggregateIndex: 2, admittedThroughPushIndex: 1 },
        });
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([0, 1]);
        releaseSlow.resolve();
        const latest = yield* Effect.promise(() => coalesced.promise);
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([
          0, 1, 4,
        ]);
        expect(latest).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          resources: [{ amount: 21 }],
          metadata: { aggregateIndex: 2, admittedThroughPushIndex: 1 },
        });
        expect(latest.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: retainedA.pushIndex,
            commandName: 'increment',
            nodeId: retainedA.nodeId,
            nodeIndex: 1,
            resolution: {
              id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
              commandName: 'increment',
              aggregateIndex: 1,
              failure: privateFailure,
            },
          },
        ]);
        const beforeRetry = yield* Effect.promise(() =>
          Promise.all([
            node.db.select().from(aggregateNodeCommands),
            node.db.select().from(aggregateNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]),
        );
        // A new exact input interest can publish at an unchanged prefix after an idempotent retry.
        interests = [...interests, commandB];
        expect(yield* Effect.promise(() => node.accept(commandB))).toEqual(
          retainedB,
        );
        const interested = yield* Effect.promise(() => withNewInterest.promise);
        expect(interested.nodeIndex).toBe(4);
        expect(interested.resources).toEqual(latest.resources);
        expect(interested.commandCoverage).toEqual([
          ...latest.commandCoverage,
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: retainedB.pushIndex,
            commandName: 'increment',
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            resolution: null,
          },
        ]);
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([
          0, 1, 4, 4,
        ]);
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(aggregateNodeCommands),
              node.db.select().from(aggregateNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual(beforeRetry);
      }),
  );

  it.effect(
    'Service publishes outside SQL and coalesces slow views without losing owned recovery',
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
                fields: ['amount'],
              },
            },
            operations: { update: counterV1.operations.update },
            program: Effect.fn('ServiceIncrement.program')(function* ({
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
          defineService({ name: 'publication' }),
          { version: 1, models, system: { increment } },
        );
        const definition = makeServiceSessionDefinition({
          systemName: 'publication',
          serviceName: release.name,
          serviceVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'counter',
          claimsSchema: Schema.Struct({}),
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
              apiUrl: 'https://publication.example',
              publishableKey: 'pub_publication',
              systemName: definition.systemName,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,
              sessionName: definition.sessionName,
              claims: {},
              definitionHash: 'publication',
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
          sessionId: 'sesn_publication' as const,
          sessionIndex: 1,
          commandName: 'increment',
          contractVersion: 1,
          payload: '{}',
          kind: 'actor' as const,
          serviceName: definition.serviceName,
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
          claims: {},
          stagingOutcome: {
            result: 1,
            completedAt: '2026-10-26T01:00:00.000Z',
          },
        } satisfies IServiceNodeCommand;
        const commandB = {
          ...commandA,
          sessionIndex: 2,
          stagingOutcome: {
            result: 2,
            completedAt: '2026-10-26T01:00:01.000Z',
          },
        };
        let interests: IServiceNodeCommand[] = [commandA];
        const slowViews: IServiceNodeSnapshot[] = [];
        const initialReentrant = Promise.withResolvers<IServiceNodeSnapshot>();
        const initialRetention = Promise.withResolvers<INodeRetention>();
        const slowEntered = Promise.withResolvers<IServiceNodeSnapshot>();
        const releaseSlow = Promise.withResolvers<void>();
        const coalesced = Promise.withResolvers<IServiceNodeSnapshot>();
        const withNewInterest = Promise.withResolvers<IServiceNodeSnapshot>();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => releaseSlow.resolve()),
        );
        let held = false;
        const detachSlow = yield* Effect.promise(() =>
          node.subscribe(
            {},
            {
              state: async () => {},
              view: async snapshot => {
                slowViews.push(snapshot);
                if (snapshot.nodeIndex === 0) {
                  // Both calls reenter the Node while its initial view callback is active.
                  initialReentrant.resolve(await node.snapshot());
                  initialRetention.resolve(await node.accept(commandA));
                } else if (snapshot.nodeIndex === 1 && !held) {
                  held = true;
                  slowEntered.resolve(snapshot);
                  await releaseSlow.promise;
                } else if (
                  snapshot.nodeIndex === 4 &&
                  snapshot.commandCoverage.length === 1
                ) {
                  coalesced.resolve(snapshot);
                } else if (
                  snapshot.nodeIndex === 4 &&
                  snapshot.commandCoverage.length === 2
                ) {
                  withNewInterest.resolve(snapshot);
                }
              },
            },
            () => interests,
          ),
        );
        yield* Effect.addFinalizer(() => Effect.sync(detachSlow));
        expect(
          yield* Effect.promise(() => initialReentrant.promise),
        ).toMatchObject({
          nodeIndex: 0,
          resources: [{ amount: 0 }],
        });
        const retainedA = yield* Effect.promise(() => initialRetention.promise);
        const heldView = yield* Effect.promise(() => slowEntered.promise);
        expect(slowViews[0]).toMatchObject({
          nodeIndex: 0,
          resources: [{ amount: 0 }],
          commandCoverage: [
            {
              sessionId: commandA.sessionId,
              sessionIndex: commandA.sessionIndex,
              pushIndex: null,
              nodeId: null,
              nodeIndex: null,
              resolution: null,
            },
          ],
        });
        expect(heldView).toMatchObject({
          nodeIndex: 1,
          resources: [{ amount: 1 }],
          commandCoverage: [
            {
              sessionId: commandA.sessionId,
              sessionIndex: commandA.sessionIndex,
              pushIndex: retainedA.pushIndex,
              nodeId: retainedA.nodeId,
              nodeIndex: 1,
              resolution: null,
            },
          ],
        });
        const fastLatest = Promise.withResolvers<IServiceNodeSnapshot>();
        const fastViews: IServiceNodeSnapshot[] = [];
        const detachFast = yield* Effect.promise(() =>
          node.subscribe(
            {},
            {
              state: async () => {},
              view: async snapshot => {
                fastViews.push(snapshot);
                if (snapshot.nodeIndex === 4) {
                  fastLatest.resolve(snapshot);
                }
              },
            },
          ),
        );
        yield* Effect.addFinalizer(() => Effect.sync(detachFast));
        expect(fastViews[0]).toMatchObject({
          nodeIndex: 1,
          resources: [{ amount: 1 }],
          commandCoverage: [],
        });
        // Acceptance and another subscriber keep progressing while the first callback is held.
        const retainedB = yield* Effect.promise(() => node.accept(commandB));
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
            commandName: 'increment',
            serviceIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            failure: privateFailure,
            delta: { upserted: [], deleted: [] },
          }),
        );
        yield* Effect.promise(() =>
          node.receiveCommand({
            id: 'cmd_foreign',
            commandName: 'foreignChange',
            serviceIndex: 2,
            dispositionChainHash: '2'.repeat(64),
            failure: null,
            delta: {
              upserted: [{ ...baselineResource, amount: 20 }],
              deleted: [],
            },
          }),
        );
        expect(yield* Effect.promise(() => fastLatest.promise)).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          resources: [{ amount: 21 }],
          commandCoverage: [],
          metadata: { serviceIndex: 2, admittedThroughPushIndex: 1 },
        });
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([0, 1]);
        releaseSlow.resolve();
        const latest = yield* Effect.promise(() => coalesced.promise);
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([
          0, 1, 4,
        ]);
        expect(latest).toMatchObject({
          nodeIndex: 4,
          pushIndex: 2,
          outcomeIndex: 1,
          resources: [{ amount: 21 }],
          metadata: { serviceIndex: 2, admittedThroughPushIndex: 1 },
        });
        expect(latest.commandCoverage).toEqual([
          {
            sessionId: commandA.sessionId,
            sessionIndex: commandA.sessionIndex,
            pushIndex: retainedA.pushIndex,
            commandName: 'increment',
            nodeId: retainedA.nodeId,
            nodeIndex: 1,
            resolution: {
              id: makeNodeCommandId(retainedA.nodeId, retainedA.pushIndex),
              commandName: 'increment',
              serviceIndex: 1,
              failure: privateFailure,
            },
          },
        ]);
        const beforeRetry = yield* Effect.promise(() =>
          Promise.all([
            node.db.select().from(serviceNodeCommands),
            node.db.select().from(serviceNodeMetadata),
            node.db.select().from(counterV1.drizzleSchema),
          ]),
        );
        // A new exact input interest can publish at an unchanged prefix after an idempotent retry.
        interests = [...interests, commandB];
        expect(yield* Effect.promise(() => node.accept(commandB))).toEqual(
          retainedB,
        );
        const interested = yield* Effect.promise(() => withNewInterest.promise);
        expect(interested.nodeIndex).toBe(4);
        expect(interested.resources).toEqual(latest.resources);
        expect(interested.commandCoverage).toEqual([
          ...latest.commandCoverage,
          {
            sessionId: commandB.sessionId,
            sessionIndex: commandB.sessionIndex,
            pushIndex: retainedB.pushIndex,
            commandName: 'increment',
            nodeId: retainedB.nodeId,
            nodeIndex: retainedB.nodeIndex,
            resolution: null,
          },
        ]);
        expect(slowViews.map(snapshot => snapshot.nodeIndex)).toEqual([
          0, 1, 4, 4,
        ]);
        expect(
          yield* Effect.promise(() =>
            Promise.all([
              node.db.select().from(serviceNodeCommands),
              node.db.select().from(serviceNodeMetadata),
              node.db.select().from(counterV1.drizzleSchema),
            ]),
          ),
        ).toEqual(beforeRetry);
      }),
  );
});
