import { readFileSync } from 'node:fs';

import { describe, expect, it } from '@effect/vitest';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import {
  AggregateNode,
  type IAggregateNodeSnapshot,
} from '@zerospin/core/AggregateNode/AggregateNode';
import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from '@zerospin/core/AggregateNode/aggregateNodeTables';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import type {
  ISqliteClient,
  ISqliteStatementParameter,
} from '@zerospin/core/drizzle/types';
import { makeServiceNodeOptimisticView } from '@zerospin/core/ServiceNode/makeServiceNodeOptimisticView';
import {
  ServiceNode,
  type IServiceNodeSnapshot,
} from '@zerospin/core/ServiceNode/ServiceNode';
import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from '@zerospin/core/ServiceNode/serviceNodeTables';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

const wasmBinary = readFileSync(
  new URL(import.meta.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm')),
);
const openMemory = () =>
  makeInMemorySQLite3(() => SQLiteESMFactory({ wasmBinary }));
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

function makeHold() {
  return {
    entered: Promise.withResolvers<void>(),
    release: Promise.withResolvers<void>(),
    finished: Promise.withResolvers<void>(),
    completed: false,
  };
}

/** Exercise the common public lifecycle on each real family Node. */
function verifyDisposalFences(
  node: AggregateNode | ServiceNode,
  readStorage: () => Promise<unknown>,
) {
  return Effect.gen(function* () {
    const stateHold = makeHold();
    const resetViewHold = makeHold();
    const closeViewHold = makeHold();
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        for (const hold of [stateHold, resetViewHold, closeViewHold]) {
          hold.release.resolve();
        }
        await node.close();
      }),
    );
    yield* Effect.promise(async () => {
      const oldViews: (IAggregateNodeSnapshot | IServiceNodeSnapshot)[] = [];
      let blockOldState = false;
      const detach = await node.subscribe(
        {},
        {
          state: async () => {
            if (blockOldState) {
              blockOldState = false;
              stateHold.entered.resolve();
              await stateHold.release.promise;
              stateHold.completed = true;
              stateHold.finished.resolve();
            }
          },
          view: async (
            snapshot: IAggregateNodeSnapshot | IServiceNodeSnapshot,
          ) => {
            oldViews.push(snapshot);
          },
        },
      );
      expect(oldViews).toHaveLength(1);
      blockOldState = true;
      await node.setPushPaused(true);
      await stateHold.entered.promise;
      // A pending remote state callback neither owns the SQL gate nor delays replacement.
      await node.setPushPaused(false);
      detach();
      const replacementViews: (
        | IAggregateNodeSnapshot
        | IServiceNodeSnapshot
      )[] = [];
      const resetDelivered = Promise.withResolvers<
        IAggregateNodeSnapshot | IServiceNodeSnapshot
      >();
      let nextViewHold: ReturnType<typeof makeHold> | undefined;
      let resetCount = 0;
      await node.subscribe(
        {},
        {
          state: async () => {},
          reset: async () => {
            resetCount += 1;
          },
          view: async (
            snapshot: IAggregateNodeSnapshot | IServiceNodeSnapshot,
          ) => {
            replacementViews.push(snapshot);
            const hold = nextViewHold;
            nextViewHold = undefined;
            if (hold !== undefined) {
              hold.entered.resolve();
              await hold.release.promise;
              hold.completed = true;
              hold.finished.resolve();
            } else if (resetCount > 0) {
              resetDelivered.resolve(snapshot);
            }
          },
        },
      );
      expect(stateHold.completed).toBe(false);
      expect(replacementViews).toHaveLength(1);
      expect(replacementViews[0]!.metadata.pushPaused).toBe(false);
      stateHold.release.resolve();
      await stateHold.finished.promise;

      // Reset retires the old delivery epoch without waiting for its callback to finish.
      nextViewHold = resetViewHold;
      await node.setPushPaused(true);
      await resetViewHold.entered.promise;
      const finishReset = await node.prepareReset();
      expect(resetCount).toBe(1);
      expect(resetViewHold.completed).toBe(false);
      await expect(node.setPushPaused(false)).rejects.toMatchObject({
        code: 'node-staging-blocked',
      });
      await finishReset(true);
      const resumed = await resetDelivered.promise;
      expect(resumed.metadata.pushPaused).toBe(true);
      expect(resetViewHold.completed).toBe(false);
      expect(replacementViews).toHaveLength(3);
      resetViewHold.release.resolve();
      await resetViewHold.finished.promise;

      // Close joins local tasks but does not wait for an already-invoked remote view.
      nextViewHold = closeViewHold;
      await node.setPushPaused(true);
      await closeViewHold.entered.promise;
      const beforeClose = await readStorage();
      await node.close();
      expect(closeViewHold.completed).toBe(false);
      expect(await readStorage()).toEqual(beforeClose);
      await expect(node.snapshot()).rejects.toMatchObject({
        code: 'node-closed',
      });
      closeViewHold.release.resolve();
      await closeViewHold.finished.promise;
      expect(oldViews).toHaveLength(1);
      expect(replacementViews).toHaveLength(4);
    });
  });
}

describe('Real Node subscriber disposal and reset fences', () => {
  it.effect(
    'Aggregate retires slow state/view deliveries across detach, reset and close',
    () =>
      Effect.gen(function* () {
        const definition = makeAggregateSessionDefinition({
          systemName: 'disposal',
          aggregateName: 'account',
          aggregateVersion: 1,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'disposal',
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
          models: {},
          contracts: {},
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
              apiUrl: 'https://disposal.example',
              publishableKey: 'pub_disposal',
              systemName: 'disposal',
              aggregateName: 'account',
              aggregateVersion: 1,
              aggregateId: 'account',
              actorName: 'member',
              actorVersion: 1,
              sessionName: 'disposal',
              claims: { aggregateId: 'account' },
              definitionHash: 'disposal',
            },
            lock: makeAggregateSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.promise(() => node.initialize());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [],
          }),
        );
        yield* verifyDisposalFences(node, () =>
          Promise.all([
            node.db.select().from(aggregateNodeCommands),
            node.db.select().from(aggregateNodeMetadata),
          ]),
        );
      }),
  );

  it.effect(
    'Service retires slow state/view deliveries across detach, reset and close',
    () =>
      Effect.gen(function* () {
        const definition = makeServiceSessionDefinition({
          systemName: 'disposal',
          serviceName: 'account',
          serviceVersion: 1,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'disposal',
          claimsSchema: Schema.Struct({}),
          models: {},
          contracts: {},
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
              apiUrl: 'https://disposal.example',
              publishableKey: 'pub_disposal',
              systemName: 'disposal',
              serviceName: 'account',
              serviceVersion: 1,
              actorName: 'member',
              actorVersion: 1,
              sessionName: 'disposal',
              claims: {},
              definitionHash: 'disposal',
            },
            lock: makeServiceSessionLock(definition),
          },
          view,
          definition,
        );
        yield* Effect.promise(() => node.initialize());
        yield* Effect.promise(() =>
          node.initializeBaseline({
            serviceIndex: 0,
            dispositionChainHash: '0'.repeat(64),
            resolvedThrough: 0,
            resources: [],
          }),
        );
        yield* verifyDisposalFences(node, () =>
          Promise.all([
            node.db.select().from(serviceNodeCommands),
            node.db.select().from(serviceNodeMetadata),
          ]),
        );
      }),
  );
});
