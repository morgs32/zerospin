import { describe, expect, it } from '@effect/vitest';
import { makeAgentSessionHost } from '@zerospin/browser/agentNodeBrowser/makeAgentSessionHost';
import { makeMockAggregateSession } from '@zerospin/browser/makeMockAggregateSession';
import { makeMockServiceSession } from '@zerospin/browser/makeMockServiceSession';
import { makeSessionLifecycle } from '@zerospin/browser/makeSessionLifecycle';
import { makeSessionLifetime } from '@zerospin/browser/sessionLifecycle/SessionLifetime';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import { stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import { stageAggregateSessionCommandTx } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx';
import type { IAggregateCommandSession } from '@zerospin/core/aggregateSession/types';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import { makeAggregateContractExtension } from '@zerospin/core/contracts/makeAggregateContractExtension';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { operationCodecs } from '@zerospin/core/contracts/operationCodecs';
import { prepareAggregateInvocation } from '@zerospin/core/contracts/prepare/prepareAggregateInvocation';
import { prepareServiceInvocation } from '@zerospin/core/contracts/prepare/prepareServiceInvocation';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { makeTx, rehearse } from '@zerospin/core/drizzle/make/makeTx';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { applyInverseOperationTx } from '@zerospin/core/models/applyInverseOperationTx';
import { defineModel } from '@zerospin/core/models/defineModel';
import { encodeRowAsResource } from '@zerospin/core/models/encodeRowAsResource';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { modelRef } from '@zerospin/core/models/modelRef';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import { stageServiceSessionCommandTx } from '@zerospin/core/serviceSession/stageServiceSessionCommandTx';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { makeSessionFailureReporter } from '@zerospin/core/sessionFailure/makeSessionFailureReporter';
import type { ISessionLifecycleState } from '@zerospin/core/sessionFailure/types';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { makeSystemHarness } from '@zerospin/core/testing/systemHarness/makeSystemHarness';
import { makeZerospinError } from '@zerospin/error';
import { makeTelemetryCollector } from '@zerospin/logger';
import {
  CuidFactory,
  makeAbbreviationIdSchema,
  primitives,
  type IAnyTables,
} from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';
import { vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { catalogSessionDefinition } from '../../../examples/shopping/src/zerospin/catalogSessionDefinition.ts';
import { gameSessionDefinition } from '../../../examples/tic-tac-toe/src/gameSessionDefinition.ts';
import { openTestDb } from '../../../tests/support/openTestDb.ts';

vi.mock(
  '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3',
  async importOriginal => {
    const original = await importOriginal<{
      makeInMemorySQLite3: typeof makeInMemorySQLite3;
    }>();
    const { readFileSync } = await import('node:fs');
    const { default: SQLiteESMFactory } =
      await import('@livestore/wa-sqlite/dist/wa-sqlite.mjs');
    const wasmBinary = readFileSync(
      new URL(import.meta.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm')),
    );
    return {
      makeInMemorySQLite3: () =>
        original.makeInMemorySQLite3(() => SQLiteESMFactory({ wasmBinary })),
    };
  },
);

const folder = defineModel({ name: 'folder', abbreviation: 'fld' });
const folderV1 = makeModelVersion(folder, {
  version: 1,
  attributes: { label: primitives.text() },
  indexes: [],
});
const entryV1 = makeModelVersion(
  defineModel({ name: 'entry', abbreviation: 'ent' }),
  {
    version: 1,
    attributes: {
      folderId: modelRef({
        model: folder,
        nullable: false,
        relation: 'folder',
        inverse: 'entries',
      }),
      note: primitives.text({ nullable: true }),
      details: primitives.json({
        schema: Schema.Struct({
          labels: Schema.Array(Schema.String),
          enabled: Schema.Boolean,
        }),
      }),
    },
    indexes: [],
  },
);
const models = { folder: folderV1, entry: entryV1 };
const createdAt = new Date('2020-01-02T03:04:05.000Z');
const updatedAt = new Date('2020-02-03T04:05:06.000Z');
const originalEntry = {
  id: 'ent_one' as const,
  createdAt,
  updatedAt,
  folderId: 'fld_old' as const,
  note: null,
  details: { labels: ['first', '雪'], enabled: true },
};
const genesisHash = '0'.repeat(64);

/** Provision one replica and its seed graph; each scenario owns its metadata and invocation. */
function openReplica<TABLES extends IAnyTables>(tables: TABLES) {
  return Effect.gen(function* () {
    const opened = yield* openTestDb(models);
    const config = makeResourceDbConfig({ models, otherTables: tables });
    const db = makeSqliteDrizzle(opened.db.$client, config);
    yield* provisionDb({ db, definition: config.definition });
    yield* makeTx('seedStagingInverseGraph')(function* (tx) {
      for (const parent of [
        { id: 'fld_old' as const, label: 'Old folder', createdAt, updatedAt },
        { id: 'fld_new' as const, label: 'New folder', createdAt, updatedAt },
      ]) {
        tx.insert(folderV1.drizzleSchema)
          .values(yield* folderV1.table.encodeRow(parent))
          .run();
      }
      tx.insert(entryV1.drizzleSchema)
        .values(yield* entryV1.table.encodeRow(originalEntry))
        .run();
    })(db);
    expect(db.values(sql`PRAGMA foreign_key_list("entry")`)).toHaveLength(1);
    expect(
      db
        .values(sql`PRAGMA table_info("entry")`)
        .map(column => column[1])
        .sort(),
    ).toEqual(['createdAt', 'details', 'folderId', 'id', 'note', 'updatedAt']);
    const storedEntry = db.select().from(entryV1.drizzleSchema).get();
    if (storedEntry === undefined) throw new Error('Expected seeded Entry row');
    expect(
      yield* encodeRowAsResource(
        entryV1,
        yield* entryV1.table.decodeRow(storedEntry),
      ),
    ).toEqual({
      ...originalEntry,
      details: JSON.stringify(originalEntry.details),
      modelName: 'entry',
      version: 1,
    });
    return db;
  });
}

it('requires exact operation branches and accepts replay-only contract inventory', () => {
  const aggregate = defineAggregate({ name: 'sender' });
  const service = defineService({ name: 'destination' });
  const receive = makeServiceContractRelease(defineServiceContract('receive'), {
    version: 1,
    payload: {},
  });
  const followUp = makeAggregateContractRelease(
    defineAggregateContract('followUp'),
    { version: 1, payload: {} },
  );
  const followUpV2 = upgradeAggregateContractRelease(followUp, { version: 2 });
  const send = makeAggregateContractRelease(defineAggregateContract('send'), {
    version: 1,
    payload: {},
    operations: {
      receive: makeCommandOperation({
        destination: { service, version: 1 },
        contract: receive,
        onFailure: { contract: followUp, payload: () => Effect.succeed({}) },
      }),
    },
  });
  expect(() =>
    makeAggregateRelease(aggregate, {
      version: 1,
      system: { send },
      actors: {},
    }),
  ).toThrow(/explicitly registered/);
  const origin = makeAggregateRelease(aggregate, {
    version: 1,
    system: { send },
    contracts: { followUp },
    actors: {},
  });
  const successor = makeAggregateRelease(aggregate, {
    version: 2,
    branchFrom: origin,
    contracts: { followUp: followUpV2 },
    actors: {},
  });
  const spec = makeSystemSpec({
    system: makeSystem({
      name: 'operationInventory',
      aggregates: { sender: { releases: { 1: origin, 2: successor } } },
      services: {
        destination: {
          releases: {
            1: makeServiceRelease(service, {
              version: 1,
              models: {},
              system: { receive },
            }),
          },
          canonical: 1,
        },
      },
    }),
  });
  expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
  expect(spec.aggregates.sender!.releases[2]!.contracts).toEqual({
    followUp: 2,
  });

  const invalid = structuredClone(spec);
  Reflect.set(invalid.aggregates.sender!.releases[1]!.contracts, 'followUp', 2);
  expect(() => Schema.decodeUnknownSync(SystemSpecSchema)(invalid)).toThrow(
    /Operation continuation must match an exact/,
  );
});

it('requires a predecessor on later Aggregate releases at both configuration boundaries', () => {
  const definition = defineAggregate({ name: 'lineage' });
  const first = makeAggregateRelease(definition, {
    version: 2,
    models: {},
    actors: {},
  });
  const disconnected = makeAggregateRelease(definition, {
    version: 3,
    models: {},
    actors: {},
  });
  expect(() =>
    makeSystem({
      name: 'lineage',
      aggregates: {
        lineage: { releases: { 2: first, 3: disconnected } },
      },
    }),
  ).toThrow('Aggregate lineage@3 must name a predecessor');

  const second = makeAggregateRelease(definition, {
    version: 3,
    branchFrom: first,
    models: {},
    actors: {},
  });
  const spec = makeSystemSpec({
    system: makeSystem({
      name: 'lineage',
      aggregates: {
        lineage: { releases: { 2: first, 3: second } },
      },
    }),
  });
  expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
  Reflect.deleteProperty(spec.aggregates.lineage!.releases[3]!, 'branchFrom');
  expect(() => Schema.decodeUnknownSync(SystemSpecSchema)(spec)).toThrow(
    'Aggregate lineage@3 must name a predecessor',
  );
});

describe('Native transaction rehearsal', () => {
  it.effect(
    'discards successful writes and preserves a complete rejected Cause',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openTestDb(models);
        yield* rehearse(db, tx =>
          Effect.gen(function* () {
            tx.insert(folderV1.drizzleSchema)
              .values(
                yield* folderV1.table.encodeRow({
                  id: 'fld_rehearsal',
                  createdAt,
                  updatedAt,
                  label: 'temporary',
                }),
              )
              .run();
            return 'discarded';
          }),
        );
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual([]);

        const evaluationFailure = new Error('evaluation rejected');
        const cleanupDefect = new Error('cleanup defect');
        const rejectedCause = Cause.combine(
          Cause.fail(evaluationFailure),
          Cause.die(cleanupDefect),
        );
        const rejected = yield* rehearse(db, tx =>
          Effect.gen(function* () {
            tx.insert(folderV1.drizzleSchema)
              .values(
                yield* folderV1.table.encodeRow({
                  id: 'fld_rehearsal',
                  createdAt,
                  updatedAt,
                  label: 'temporary',
                }),
              )
              .run();
            return yield* Effect.failCause(rejectedCause);
          }),
        ).pipe(Effect.exit);
        if (Exit.isSuccess(rejected))
          throw new Error('Expected rehearsal rejection');
        expect(rejected.cause.reasons.map(reason => reason._tag)).toEqual([
          'Fail',
          'Die',
        ]);
        const [failure, defect] = rejected.cause.reasons;
        if (
          failure === undefined ||
          defect === undefined ||
          !Cause.isFailReason(failure) ||
          !Cause.isDieReason(defect)
        ) {
          throw new Error('Expected the original failure and cleanup defect');
        }
        expect(failure.error).toBe(evaluationFailure);
        expect(defect.defect).toBe(cleanupDefect);
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual([]);
      }),
  );

  it.effect(
    'reports failed rollback together with its original evaluation failure',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openTestDb(models);
        const statements = db.$client.sqlite3.statements;
        const rollbackFailure = new Error('rollback refused');
        const intercepted = vi
          .spyOn(db.$client.sqlite3, 'statements')
          .mockImplementation((connection, statementSql, options) => {
            if (statementSql.trim().toLowerCase() === 'rollback')
              throw rollbackFailure;
            return statements(connection, statementSql, options);
          });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            intercepted.mockRestore();
            db.$client.sqlite3.exec(db.$client.db, 'ROLLBACK;');
          }),
        );
        const rejected = yield* rehearse(db, () =>
          Effect.fail(new Error('evaluation rejected')),
        ).pipe(Effect.exit);
        if (Exit.isSuccess(rejected))
          throw new Error('Expected rollback failure');
        expect(Cause.squash(rejected.cause)).toMatchObject({
          code: 'drizzle-transaction-failed',
          cause: expect.stringContaining('rollback refused'),
        });
        expect(Cause.squash(rejected.cause)).toMatchObject({
          cause: expect.stringContaining('evaluation rejected'),
        });
      }),
  );
});

describe('Staging rollback, retained delete/move inverses and allocation exhaustion', () => {
  it.effect(
    'aggregate rolls back staging, restores move/delete inverses and refuses exhausted allocation',
    () =>
      Effect.gen(function* () {
        let encodes = 0;
        let decodes = 0;
        const codec = Schema.String.pipe(
          Schema.decodeTo(Schema.String, {
            decode: SchemaGetter.transform(value => {
              decodes++;
              return `${value}!`;
            }),
            encode: SchemaGetter.transform(value => {
              encodes++;
              return value.slice(0, -1);
            }),
          }),
        );
        const codecObservations: { encodes: number; decodes: number }[] = [];
        const mutate = makeAggregateContractRelease(
          defineAggregateContract('moveThenDelete'),
          {
            version: 1,
            payload: {
              label: primitives.text({ defaultValue: 'untitled' }),
              token: primitives.json({ schema: codec }),
            },
            models: {
              folder: {
                model: models.folder,
                fields: ['label'],
              },
              entry: {
                model: models.entry,
                fields: ['folderId'],
              },
            },
            operations: {
              move: entryV1.operations.move,
              remove: entryV1.operations.delete,
            },
            guard: Effect.fn('aggregateMoveThenDelete.guard')(function* ({
              db,
              command,
              payload,
            }) {
              expect(payload).toEqual({ label: 'untitled', token: 'value!' });
              expect(command.payload).toEqual({
                label: 'untitled',
                token: 'value!',
              });
              codecObservations.push({ encodes, decodes });
              const entry = yield* findFirst({
                db,
                model: db.models.entry,
                where: { id: { eq: originalEntry.id } },
              });
              expect(entry).toEqual({
                id: originalEntry.id,
                folderId: 'fld_old',
              });
              const folder = yield* findFirst({
                db,
                model: db.models.folder,
                where: { id: { eq: 'fld_old' } },
              });
              expect(folder).toEqual({ id: 'fld_old', label: 'Old folder' });
            }),
            program: Effect.fn('aggregateMoveThenDelete.program')(function* ({
              operations,
            }) {
              yield* operations.move({
                resourceId: originalEntry.id,
                property: 'folderId',
                prevId: 'fld_old',
                nextId: 'fld_new',
              });
              yield* operations.remove({ resourceId: originalEntry.id });
            }),
          },
        );
        const release = makeAggregateRelease(
          defineAggregate({ name: 'staging' }),
          {
            version: 1,
            models,
            system: { moveThenDelete: mutate },
            actors: {},
          },
        );
        const definition = makeAggregateSessionDefinition({
          systemName: 'staging',
          aggregateName: release.name,
          aggregateVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'entries',
          claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
          models: release.models,
          contracts: release.contracts,
        });
        const db = yield* openReplica(aggregateSessionRepoDbConfig.tables);
        const { commands, sessionMetadata } =
          aggregateSessionRepoDbConfig.schema;
        db.insert(sessionMetadata)
          .values({
            sessionId: 'sesn_entries',
            lastSessionIndex: 0,
            afterNodeIndex: 0,
            aggregateIndex: 0,
            dispositionChainHash: genesisHash,
          })
          .run();
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition: definition,
          db,
          admitted: {
            sessionId: 'sesn_entries',
            aggregateId: 'staging',
            actorName: 'member',
            actorVersion: 1,
            claims: { aggregateId: 'staging' },
          },
        });
        const beforeMetadata = db.select().from(sessionMetadata).all();
        const beforeFolders = db.select().from(folderV1.drizzleSchema).all();
        const beforeEntries = db.select().from(entryV1.drizzleSchema).all();
        let callbackAfterCommit = false;
        const onCommandStaged = vi.fn<(command: IAggregateNodeCommand) => void>(
          () => {
            db.$client.sqlite3.exec(
              db.$client.db,
              'BEGIN IMMEDIATE; ROLLBACK;',
            );
            callbackAfterCommit = true;
            throw new Error('Journal unavailable');
          },
        );
        let observerSawCallback: boolean | undefined;
        const unsubscribe = db.$client.subscribeToTableChanges(() => {
          observerSawCallback = callbackAfterCommit;
        });
        const staged = yield* stageAggregateSessionCommandTx(db, {
          initialized,
          contractName: 'moveThenDelete',
          contract: mutate,
          payload: { token: 'value!' },
          onCommandStaged,
        }).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('mutate')),
        );
        unsubscribe();
        expect(observerSawCallback).toBe(false);
        const retainedRows = db.select().from(commands).all();
        expect(retainedRows).toHaveLength(1);
        const retained =
          yield* aggregateSessionRepoDbConfig.tables.commands.decodeRow(
            retainedRows[0]!,
          );
        expect(retained).toMatchObject({ sessionIndex: 1 });
        expect(JSON.parse(retained.payload)).toMatchObject({
          label: 'untitled',
        });
        expect(codecObservations).toEqual([{ encodes: 1, decodes: 1 }]);
        expect(staged.sessionIndex).toBe(1);
        expect(staged.payload).toEqual({ label: 'untitled', token: 'value!' });
        expect(callbackAfterCommit).toBe(true);
        expect(onCommandStaged).toHaveBeenCalledTimes(1);
        expect(onCommandStaged.mock.calls[0]?.[0]).toEqual({
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          kind: 'actor',
          commandName: 'moveThenDelete',
          contractVersion: 1,
          payload: retainedRows[0]!.payload,
          aggregateName: 'staging',
          aggregateVersion: 1,
          aggregateId: 'staging',
          actorName: 'member',
          actorVersion: 1,
          claims: { aggregateId: 'staging' },
          sessionName: 'entries',
          sessionId: 'sesn_entries',
          sessionIndex: 1,
          stagingOutcome: {
            result: retained.stagingOutcome.result,
            completedAt: retained.stagingOutcome.completedAt.toISOString(),
          },
        });
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual([]);
        const inverses = retained.inverseOperations ?? [];
        expect(inverses.map(inverse => inverse.operationName)).toEqual([
          'move',
          'delete',
        ]);
        const [move, remove] = inverses;
        if (
          move?.operationName !== 'move' ||
          remove?.operationName !== 'delete'
        ) {
          throw new Error('Expected retained move followed by delete inverse');
        }
        expect(move.previousUpdatedAt).toEqual(updatedAt);
        const codecs = operationCodecs(entryV1);
        expect(
          yield* Schema.decodeUnknownEffect(codecs.moveInverse)(
            move.inverseOperation,
          ),
        ).toEqual({ property: 'folderId', prevId: 'fld_old' });
        expect(
          yield* Schema.decodeUnknownEffect(codecs.deleteInverse)(
            remove.inverseOperation,
          ),
        ).toEqual({
          resource: {
            ...originalEntry,
            modelName: entryV1.modelName,
            version: entryV1.version,
            folderId: 'fld_new',
            updatedAt: retained.stagingOutcome.completedAt,
          },
        });
        expect(retained.stagingOutcome.completedAt).not.toEqual(updatedAt);
        yield* makeTx('restoreAggregateStoredInverses')(function* (tx) {
          for (const inverse of [...inverses].reverse()) {
            yield* applyInverseOperationTx({
              tx,
              model: entryV1,
              operation: inverse,
            });
          }
        })(db);
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
          beforeEntries,
        );
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
          beforeFolders,
        );
        expect(db.select().from(commands).all()).toEqual(retainedRows);
        expect(db.select().from(sessionMetadata).all()).toEqual(
          beforeMetadata.map(row => ({ ...row, lastSessionIndex: 1 })),
        );
        expect(db.values(sql`PRAGMA foreign_key_check`)).toEqual([]);

        // A retained safe position may leave no allocatable successor. Aggregate
        // evaluates move/delete before allocating, so exhaustion must undo both.
        db.update(sessionMetadata)
          .set({ lastSessionIndex: Number.MAX_SAFE_INTEGER - 1 })
          .run();
        const exhaustedMetadata = db.select().from(sessionMetadata).all();
        const exhaustedCommands = db.select().from(commands).all();
        const exhausted = yield* stageAggregateSessionCommandTx(db, {
          initialized,
          contractName: 'moveThenDelete',
          contract: mutate,
          payload: { token: 'value!' },
          onCommandStaged,
        }).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('exhausted')),
          Effect.exit,
        );
        if (Exit.isSuccess(exhausted)) {
          throw new Error('Expected Aggregate session allocation exhaustion');
        }
        expect(Cause.squash(exhausted.cause)).toMatchObject({
          code: 'session-index-invalid',
        });
        expect(onCommandStaged).toHaveBeenCalledTimes(1);
        expect(db.select().from(commands).all()).toEqual(exhaustedCommands);
        expect(db.select().from(sessionMetadata).all()).toEqual(
          exhaustedMetadata,
        );
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
          beforeFolders,
        );
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
          beforeEntries,
        );
      }),
  );

  it.effect(
    'service rolls back staging, restores move/delete inverses and refuses exhausted allocation',
    () =>
      Effect.gen(function* () {
        const mutate = makeServiceContractRelease(
          defineServiceContract('moveThenDelete'),
          {
            version: 1,
            payload: { label: primitives.text({ defaultValue: 'untitled' }) },
            models: {
              folder: {
                model: models.folder,
                fields: ['label'],
              },
              entry: {
                model: models.entry,
                fields: ['folderId'],
              },
            },
            operations: {
              move: entryV1.operations.move,
              remove: entryV1.operations.delete,
            },
            guard: Effect.fn('serviceMoveThenDelete.guard')(function* ({
              db,
              command,
              payload,
            }) {
              expect(payload).toEqual({ label: 'untitled' });
              expect(command.payload).toEqual({ label: 'untitled' });
              const entry = yield* findFirst({
                db,
                model: db.models.entry,
                where: { id: { eq: originalEntry.id } },
              });
              expect(entry).toEqual({
                id: originalEntry.id,
                folderId: 'fld_old',
              });
              const folder = yield* findFirst({
                db,
                model: db.models.folder,
                where: { id: { eq: 'fld_old' } },
              });
              expect(folder).toEqual({ id: 'fld_old', label: 'Old folder' });
            }),
            program: Effect.fn('serviceMoveThenDelete.program')(function* ({
              operations,
            }) {
              yield* operations.move({
                resourceId: originalEntry.id,
                property: 'folderId',
                prevId: 'fld_old',
                nextId: 'fld_new',
              });
              yield* operations.remove({ resourceId: originalEntry.id });
            }),
          },
        );
        const release = makeServiceRelease(defineService({ name: 'staging' }), {
          version: 1,
          models,
          system: { moveThenDelete: mutate },
        });
        const definition = makeServiceSessionDefinition({
          systemName: 'staging',
          serviceName: release.name,
          serviceVersion: release.version,
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'entries',
          claimsSchema: Schema.Struct({}),
          models: release.models,
          contracts: release.contracts,
        });
        const db = yield* openReplica(serviceSessionRepoDbConfig.tables);
        const { commands, serviceSessionMetadata } =
          serviceSessionRepoDbConfig.schema;
        db.insert(serviceSessionMetadata)
          .values({
            lastSessionIndex: 0,
            afterNodeIndex: 0,
            serviceIndex: 0,
            dispositionChainHash: genesisHash,
          })
          .run();
        const beforeMetadata = db.select().from(serviceSessionMetadata).all();
        const beforeFolders = db.select().from(folderV1.drizzleSchema).all();
        const beforeEntries = db.select().from(entryV1.drizzleSchema).all();
        let callbackAfterCommit = false;
        const onCommandStaged = vi.fn<(command: IServiceNodeCommand) => void>(
          () => {
            db.$client.sqlite3.exec(
              db.$client.db,
              'BEGIN IMMEDIATE; ROLLBACK;',
            );
            callbackAfterCommit = true;
            throw new Error('Journal unavailable');
          },
        );
        let observerSawCallback: boolean | undefined;
        const unsubscribe = db.$client.subscribeToTableChanges(() => {
          observerSawCallback = callbackAfterCommit;
        });
        const staged = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_entries',
          db,
          definition,
          contract: mutate,
          payload: {},
          claims: {},
          onCommandStaged,
        }).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('mutate')),
        );
        unsubscribe();
        expect(observerSawCallback).toBe(false);
        const retainedRows = db.select().from(commands).all();
        expect(retainedRows).toHaveLength(1);
        const retained =
          yield* serviceSessionRepoDbConfig.tables.commands.decodeRow(
            retainedRows[0]!,
          );
        expect(retained).toMatchObject({ sessionIndex: 1 });
        expect(JSON.parse(retained.payload)).toEqual({});
        expect(staged.command.sessionIndex).toBe(1);
        expect(callbackAfterCommit).toBe(true);
        expect(onCommandStaged).toHaveBeenCalledTimes(1);
        expect(onCommandStaged.mock.calls[0]?.[0]).toEqual({
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          kind: 'actor',
          commandName: 'moveThenDelete',
          contractVersion: 1,
          payload: retainedRows[0]!.payload,
          serviceName: 'staging',
          actorName: 'member',
          actorVersion: 1,
          claims: {},
          sessionName: 'entries',
          sessionId: 'sesn_entries',
          sessionIndex: 1,
          stagingOutcome: {
            result: retained.stagingOutcome.result,
            completedAt: retained.stagingOutcome.completedAt.toISOString(),
          },
        });
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual([]);
        const inverses = retained.inverseOperations ?? [];
        expect(inverses.map(inverse => inverse.operationName)).toEqual([
          'move',
          'delete',
        ]);
        const [move, remove] = inverses;
        if (
          move?.operationName !== 'move' ||
          remove?.operationName !== 'delete'
        ) {
          throw new Error('Expected retained move followed by delete inverse');
        }
        expect(move.previousUpdatedAt).toEqual(updatedAt);
        const codecs = operationCodecs(entryV1);
        expect(
          yield* Schema.decodeUnknownEffect(codecs.moveInverse)(
            move.inverseOperation,
          ),
        ).toEqual({ property: 'folderId', prevId: 'fld_old' });
        expect(
          yield* Schema.decodeUnknownEffect(codecs.deleteInverse)(
            remove.inverseOperation,
          ),
        ).toEqual({
          resource: {
            ...originalEntry,
            modelName: entryV1.modelName,
            version: entryV1.version,
            folderId: 'fld_new',
            updatedAt: retained.stagingOutcome.completedAt,
          },
        });
        expect(retained.stagingOutcome.completedAt).not.toEqual(updatedAt);
        yield* makeTx('restoreServiceStoredInverses')(function* (tx) {
          for (const inverse of [...inverses].reverse()) {
            yield* applyInverseOperationTx({
              tx,
              model: entryV1,
              operation: inverse,
            });
          }
        })(db);
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
          beforeEntries,
        );
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
          beforeFolders,
        );
        expect(db.select().from(commands).all()).toEqual(retainedRows);
        expect(db.select().from(serviceSessionMetadata).all()).toEqual(
          beforeMetadata.map(row => ({ ...row, lastSessionIndex: 1 })),
        );
        expect(db.values(sql`PRAGMA foreign_key_check`)).toEqual([]);

        // Service allocates before evaluation and must refuse the same exhausted
        // retained position without changing any command, metadata or resource.
        db.update(serviceSessionMetadata)
          .set({ lastSessionIndex: Number.MAX_SAFE_INTEGER - 1 })
          .run();
        const exhaustedMetadata = db
          .select()
          .from(serviceSessionMetadata)
          .all();
        const exhaustedCommands = db.select().from(commands).all();
        const exhausted = yield* stageServiceSessionCommandTx({
          sessionId: 'sesn_origin',
          db,
          definition,
          contract: mutate,
          payload: {},
          claims: {},
          onCommandStaged,
        }).pipe(
          Effect.provideService(CuidFactory, () => Effect.succeed('exhausted')),
          Effect.exit,
        );
        if (Exit.isSuccess(exhausted)) {
          throw new Error('Expected Service session allocation exhaustion');
        }
        expect(Cause.squash(exhausted.cause)).toMatchObject({
          code: 'session-index-invalid',
        });
        expect(onCommandStaged).toHaveBeenCalledTimes(1);
        expect(db.select().from(commands).all()).toEqual(exhaustedCommands);
        expect(db.select().from(serviceSessionMetadata).all()).toEqual(
          exhaustedMetadata,
        );
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
          beforeFolders,
        );
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
          beforeEntries,
        );
      }),
  );
});

describe('Session lifetime ownership', () => {
  it.effect(
    'fences reentrant disposal and joins work before resource cleanup',
    () =>
      Effect.promise(async () => {
        const events: string[] = [];
        const resourceClosing = Promise.withResolvers<void>();
        const releaseResource = Promise.withResolvers<void>();
        const workStarted = Promise.withResolvers<void>();
        const onDispose = vi.fn<() => void>();
        const lifetime = makeSessionLifetime({
          runtime: ManagedRuntime.make(Layer.empty),
          reportFailure: vi.fn(),
          getFailure: () => null,
          onDispose,
        });
        onDispose.mockImplementation(() => {
          events.push('revoke');
          expect(lifetime.dispose()).toBe(lifetime.closed);
        });
        await lifetime.initialize(() =>
          Effect.addFinalizer(() =>
            Effect.promise(async () => {
              events.push('resource-start');
              resourceClosing.resolve();
              await releaseResource.promise;
              events.push('resource-end');
            }),
          ),
        );
        expect(() => lifetime.initialize(() => Effect.void)).toThrow(
          expect.objectContaining({ code: 'session-already-mounted' }),
        );
        const work = lifetime.runPromise(
          Effect.gen(function* () {
            workStarted.resolve();
            yield* Effect.never;
          }).pipe(
            Effect.onExit(() =>
              Effect.sync(() => {
                expect(lifetime.signal.aborted).toBe(true);
                events.push('work');
              }),
            ),
          ),
        );
        void work.catch(() => undefined);
        await workStarted.promise;
        const disposal = lifetime.dispose();
        expect(lifetime.signal.aborted).toBe(true);
        expect(lifetime.dispose()).toBe(disposal);
        expect(onDispose).toHaveBeenCalledTimes(1);
        expect(() => lifetime.runSync(Effect.void)).toThrow(
          expect.objectContaining({ code: 'session-initialization-canceled' }),
        );
        await resourceClosing.promise;
        expect(events.slice(0, 2)).toEqual(
          expect.arrayContaining(['revoke', 'work']),
        );
        expect(events.slice(2)).toEqual(['resource-start']);
        releaseResource.resolve();
        await disposal;
        expect(events.slice(2)).toEqual(['resource-start', 'resource-end']);
      }),
  );

  it.effect('joins asynchronous finalizers from a suspended runSync', () =>
    Effect.promise(async () => {
      const events: string[] = [];
      const finalizing = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const lifetime = makeSessionLifetime({
        runtime: ManagedRuntime.make(Layer.empty),
        reportFailure: vi.fn(),
        getFailure: () => null,
        onDispose: () => {},
      });
      await lifetime.initialize(() =>
        Effect.addFinalizer(() => Effect.sync(() => events.push('resource'))),
      );
      expect(() =>
        lifetime.runSync(
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              Effect.promise(async () => {
                finalizing.resolve();
                await release.promise;
                events.push('execution');
              }),
            );
            yield* Effect.never;
          }).pipe(Effect.scoped),
        ),
      ).toThrow();
      await finalizing.promise;
      const disposal = lifetime.dispose();
      expect(events).toEqual([]);
      release.resolve();
      await disposal;
      expect(events).toEqual(['execution', 'resource']);
    }),
  );

  it.effect(
    'preserves the startup failure while independently reporting cleanup failure',
    () =>
      Effect.promise(async () => {
        const startupFailure = makeZerospinError(
          'node-authentication-rejected',
        );
        const cleanupFailure = new Error('resource cleanup failed');
        const store = createStore<ISessionLifecycleState>(() => ({
          status: 'idle',
          failure: null,
        }));
        const reportFailure = makeSessionFailureReporter({
          store,
          onTerminalFailure: () => lifetime.retire(),
        });
        const lifetime = makeSessionLifetime({
          runtime: ManagedRuntime.make(Layer.empty),
          reportFailure,
          getFailure: () => store.getState().failure,
          onDispose: () => {},
        });
        const initialization = lifetime.initialize(() =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Effect.die(cleanupFailure));
            return yield* startupFailure;
          }),
        );
        await expect(initialization).rejects.toMatchObject({
          code: startupFailure.code,
        });
        await expect(lifetime.dispose()).rejects.toBe(cleanupFailure);
        expect(store.getState().failure?.code).toBe(startupFailure.code);
      }),
  );

  it.effect(
    'cancels queued replacement and refuses replacement after failed cleanup',
    () =>
      Effect.promise(async () => {
        const store = createStore<ISessionLifecycleState>(() => ({
          status: 'idle',
          failure: null,
        }));
        const lifecycle = makeSessionLifecycle({
          layer: undefined,
          infrastructure: Layer.empty,
          store,
          telemetryCollector: makeTelemetryCollector(),
          reportFailure: vi.fn(),
          onDispose: () => {},
        });
        const cleaning = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        await lifecycle.initialize(() =>
          Effect.addFinalizer(() =>
            Effect.promise(async () => {
              cleaning.resolve();
              await release.promise;
            }),
          ),
        );
        const closing = lifecycle.dispose();
        const replacementStarted = vi.fn();
        const replacement = lifecycle.initialize(() =>
          Effect.sync(replacementStarted),
        );
        void replacement.catch(() => undefined);
        await cleaning.promise;
        expect(replacementStarted).not.toHaveBeenCalled();
        expect(lifecycle.dispose()).toBe(closing);
        await expect(replacement).rejects.toMatchObject({
          code: 'session-initialization-canceled',
        });
        release.resolve();
        await closing;
        const cleanupFailure = new Error('cannot release resource');
        await lifecycle.initialize(() =>
          Effect.addFinalizer(() => Effect.die(cleanupFailure)),
        );
        const failedClosing = lifecycle.dispose();
        const refusedReplacement = lifecycle.initialize(() =>
          Effect.sync(replacementStarted),
        );
        await expect(failedClosing).rejects.toBe(cleanupFailure);
        await expect(refusedReplacement).rejects.toBe(cleanupFailure);
        expect(replacementStarted).not.toHaveBeenCalled();
      }),
  );

  it.effect(
    'does not republish initializing after bootstrap disposes its lifetime',
    () =>
      Effect.promise(async () => {
        const store = createStore<ISessionLifecycleState>(() => ({
          status: 'idle',
          failure: null,
        }));
        const lifecycle = makeSessionLifecycle({
          layer: undefined,
          infrastructure: Layer.empty,
          store,
          telemetryCollector: makeTelemetryCollector(),
          reportFailure: vi.fn(),
          onDispose: () => {},
        });
        lifecycle.runSync(Effect.void);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const initializing = lifecycle.initialize(() =>
            Effect.sync(() => {
              void lifecycle.dispose();
            }),
          );
          await expect(initializing).rejects.toMatchObject({
            code: 'session-initialization-canceled',
          });
          expect(store.getState().status).toBe('disposed');
          await lifecycle.dispose();
        }
      }),
  );

  it.effect(
    'reinitializes Mock replicas and the browser Agent host after complete disposal',
    () =>
      Effect.promise(async () => {
        const aggregate = makeMockAggregateSession({
          definition: gameSessionDefinition,
          claims: { aggregateId: 'game-lifetime', instanceId: 'game_lifetime' },
        });
        const service = makeMockServiceSession({
          definition: catalogSessionDefinition,
          claims: Schema.decodeUnknownSync(
            catalogSessionDefinition.claimsSchema,
          )({
            clerkUserId: 'user_lifetime',
          }),
        });
        const disposeNode = vi.fn();
        const agent = makeAgentSessionHost({
          layer: undefined,
          bootstrap: ({ store }) =>
            Effect.sync(() => {
              store.setState({
                status: 'ready',
                node: {
                  sessionId: Schema.decodeUnknownSync(
                    makeAbbreviationIdSchema('sesn'),
                  )('sesn_lifetime'),
                  revoke: () => {},
                  dispose: disposeNode,
                },
              });
            }),
        });
        try {
          for (const session of [aggregate, service]) {
            await session.initialize();
            const before = session.store.getState().initialized;
            expect(before).not.toBeNull();
            const disposed = session.dispose();
            expect(session.store.getState().initialized).toBeNull();
            await disposed;
            await session.initialize();
            expect(session.store.getState().initialized).not.toBeNull();
            expect(session.store.getState().initialized).not.toBe(before);
          }
          await agent.initialize();
          expect(agent.store.getState().node).not.toBeNull();
          await agent.dispose();
          expect(agent.store.getState().node).toBeNull();
          await agent.initialize();
          expect(agent.store.getState().node).not.toBeNull();
        } finally {
          await Promise.all([
            aggregate.dispose(),
            service.dispose(),
            agent.dispose(),
          ]);
        }
        expect(disposeNode).toHaveBeenCalledTimes(2);
      }),
  );
});

class StagingGreeting extends Context.Service<StagingGreeting, string>()(
  'StagingGreeting',
) {}

const readGreeting = makeAggregateContractRelease(
  defineAggregateContract('readGreeting'),
  {
    version: 1,
    payload: {},
    result: Schema.String,
    program: Effect.fn('readGreeting.program')(function* () {
      return yield* StagingGreeting;
    }),
  },
);
const greetingSessionDefinition = makeAggregateSessionDefinition({
  systemName: 'test',
  aggregateName: 'user',
  aggregateVersion: 1,
  actorName: 'user',
  actorVersion: 1,
  sessionName: 'user',
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: {},
  contracts: { readGreeting },
});

describe('Aggregate contract-only command session', () => {
  it.effect('retains the unavailable and terminal failure behaviors', () =>
    Effect.sync(() => {
      const actual = makeMockAggregateSession({
        definition: greetingSessionDefinition,
        claims: { aggregateId: 'user_one' },
        layer: Layer.succeed(StagingGreeting, 'hello'),
      });
      const session: IAggregateCommandSession<{
        readGreeting: typeof readGreeting;
      }> = actual;
      const result = stageAggregateSessionCommand({
        session,
        contractName: 'readGreeting',
        payload: {},
      });
      expect(result).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-session-not-ready' },
      });
      expect(actual.store.getState().failure?.code).toBe(
        'aggregate-session-not-ready',
      );
      const failure = makeZerospinError('node-authentication-rejected');
      actual.store.setState({ status: 'failed', failure });
      expect(() =>
        stageAggregateSessionCommand({
          session,
          contractName: 'readGreeting',
          payload: {},
        }),
      ).toThrow(failure);
    }),
  );

  it.effect('runs a contract using its custom Effect service', () =>
    Effect.promise(async () => {
      const actual = makeMockAggregateSession({
        definition: greetingSessionDefinition,
        claims: { aggregateId: 'user_one' },
        layer: Layer.succeed(StagingGreeting, 'hello'),
      });
      const session: IAggregateCommandSession<{
        readGreeting: typeof readGreeting;
      }> = actual;
      try {
        await actual.initialize();
        const result = stageAggregateSessionCommand({
          session,
          contractName: 'readGreeting',
          payload: {},
        });
        expect(result).toMatchObject({
          _tag: 'Success',
          success: { stagingOutcome: { result: 'hello' } },
        });
      } finally {
        await actual.dispose();
      }
    }),
  );
});

describe('Fresh harness commands', () => {
  it.effect('initializes the addressed release Layer once', () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const service = defineService({ name: 'greeting' });
      const greet = makeServiceContractRelease(defineServiceContract('greet'), {
        version: 1,
        payload: {},
        result: Schema.String,
        program: () => StagingGreeting,
      });
      const first = makeServiceRelease(service, {
        version: 1,
        models: {},
        system: { greet },
        layer: Layer.effect(
          StagingGreeting,
          Effect.promise(async () => {
            acquisitions++;
            return 'first';
          }),
        ),
      });
      const second = makeServiceRelease(service, {
        version: 2,
        models: {},
        system: { greet },
        layer: Layer.succeed(StagingGreeting, 'second'),
      });
      const harness = yield* makeSystemHarness({
        system: makeSystem({
          name: 'greetings',
          aggregates: {},
          services: {
            greeting: { releases: { 1: first, 2: second }, canonical: 1 },
          },
        }),
      });
      expect(acquisitions).toBe(0);
      const invoke = (id: `cmd_${string}`, serviceVersion: number) =>
        harness.push({
          id,
          kind: 'system',
          serviceName: 'greeting',
          serviceVersion,
          commandName: 'greet',
          contractVersion: 1,
          payload: {},
        });
      expect(yield* invoke('cmd_greeting_first', 1)).toBe('first');
      expect(yield* invoke('cmd_greeting_second', 2)).toBe('second');
      expect(yield* invoke('cmd_greeting_first_again', 1)).toBe('first');
      expect(acquisitions).toBe(1);
    }).pipe(
      Effect.provideService(CuidFactory, () => Effect.succeed('greeting')),
    ),
  );

  it.effect(
    'decodes defaults for callbacks and preserves JSON validation errors',
    () =>
      Effect.gen(function* () {
        const observed: unknown[] = [];
        const payload = {
          label: primitives.text({ defaultValue: 'untitled' }),
          weight: primitives.integer({ defaultValue: 1 }),
          details: primitives.json({
            schema: Schema.Struct({
              count: Schema.Number.check(Schema.isGreaterThan(0)),
            }),
          }),
        };
        const aggregateCommand = makeAggregateContractRelease(
          defineAggregateContract('create'),
          {
            version: 1,
            payload,
            guard: Effect.fn(function* ({ command, payload }) {
              observed.push([command.payload, payload]);
            }),
            program: Effect.fn(function* ({ command, payload }) {
              observed.push([command.payload, payload]);
            }),
          },
        );
        const extension = makeAggregateContractExtension(aggregateCommand, {
          models: {},
          operations: {},
          program: Effect.fn(function* ({ command, payload }) {
            observed.push([command.payload, payload]);
          }),
        });
        const aggregate = makeAggregateRelease(
          defineAggregate({ name: 'staging' }),
          {
            version: 1,
            models: {},
            actors: {},
            system: { create: aggregateCommand },
            extensions: { create: extension },
          },
        );
        const serviceCommand = makeServiceContractRelease(
          defineServiceContract('create'),
          {
            version: 1,
            payload,
            guard: Effect.fn(function* ({ command, payload }) {
              observed.push([command.payload, payload]);
            }),
            program: Effect.fn(function* ({ command, payload }) {
              observed.push([command.payload, payload]);
            }),
          },
        );
        const service = makeServiceRelease(
          defineService({ name: 'stagingService' }),
          {
            version: 1,
            models: {},
            system: { create: serviceCommand },
          },
        );
        const system = makeSystem({
          name: 'staging',
          aggregates: { staging: { releases: { 1: aggregate } } },
          services: {
            stagingService: { releases: { 1: service }, canonical: 1 },
          },
        });
        const harness = yield* makeSystemHarness({ system });
        const base = {
          commandName: 'create',
          contractVersion: 1,
          kind: 'system' as const,
          payload: { details: { count: 1 } },
        };
        yield* harness.push({
          ...base,
          id: 'cmd_default_aggregate',
          aggregateName: 'staging',
          aggregateVersion: 1,
          aggregateId: 'one',
        });
        yield* harness.push({
          ...base,
          id: 'cmd_default_service',
          serviceName: 'stagingService',
          serviceVersion: 1,
        });
        const decoded = { label: 'untitled', weight: 1, details: { count: 1 } };
        expect(observed).toEqual(
          Array.from({ length: 5 }, () => [decoded, decoded]),
        );
        const invalid = yield* Effect.exit(
          harness.push({
            ...base,
            id: 'cmd_invalid_json',
            aggregateName: 'staging',
            aggregateVersion: 1,
            aggregateId: 'one',
            payload: { details: { count: 0 } },
          }),
        );
        if (Exit.isSuccess(invalid)) {
          throw new Error('Expected invalid JSON payload');
        }
        expect(Cause.squash(invalid.cause)).toMatchObject({
          code: 'encode-command-payload-failed',
        });
        const invalidScalar = yield* Effect.exit(
          harness.push({
            ...base,
            id: 'cmd_invalid_scalar',
            aggregateName: 'staging',
            aggregateVersion: 1,
            aggregateId: 'one',
            payload: { ...base.payload, weight: 1.5 },
          }),
        );
        if (Exit.isSuccess(invalidScalar))
          throw new Error('Expected invalid integer payload');
        expect(Cause.squash(invalidScalar.cause)).toMatchObject({
          code: 'encode-command-payload-failed',
        });
        const invalidPayload = {
          label: 'untitled',
          weight: 1,
          details: { count: 0 },
        };
        const directAggregate = yield* Effect.exit(
          prepareAggregateInvocation({
            contract: aggregateCommand,
            claims: null,
            command: {
              ...base,
              payload: invalidPayload,
              id: 'cmd_direct_aggregate',
              aggregateName: 'staging',
              aggregateVersion: 1,
              aggregateId: 'one',
            },
          }),
        );
        const directService = yield* Effect.exit(
          prepareServiceInvocation({
            contract: serviceCommand,
            claims: null,
            command: {
              ...base,
              payload: invalidPayload,
              id: 'cmd_direct_service',
              serviceName: 'stagingService',
              serviceVersion: 1,
            },
          }),
        );
        if (Exit.isSuccess(directAggregate) || Exit.isSuccess(directService)) {
          throw new Error('Expected direct invalid JSON payload');
        }
        expect(Cause.squash(directAggregate.cause)).toMatchObject({
          code: 'encode-command-json-payload-field-failed',
        });
        expect(Cause.squash(directService.cause)).toMatchObject({
          code: 'encode-command-json-payload-field-failed',
        });
      }).pipe(
        Effect.provideService(CuidFactory, () => Effect.succeed('fresh')),
      ),
  );
  it.effect(
    'does not rerun a decoded JSON codec in harness or server preparation',
    () =>
      Effect.gen(function* () {
        let encodes = 0;
        let decodes = 0;
        const codec = Schema.String.pipe(
          Schema.decodeTo(Schema.String, {
            decode: SchemaGetter.transform(value => {
              decodes++;
              return `${value}!`;
            }),
            encode: SchemaGetter.transform(value => {
              encodes++;
              return value.slice(0, -1);
            }),
          }),
        );
        const observations: unknown[] = [];
        const contract = makeAggregateContractRelease(
          defineAggregateContract('observeCodec'),
          {
            version: 1,
            payload: { content: primitives.json({ schema: codec }) },
            guard: Effect.fn(function* ({ command, payload }) {
              observations.push({
                encodes,
                decodes,
                command: command.payload,
                payload,
              });
            }),
            program: () => Effect.void,
          },
        );
        const aggregate = makeAggregateRelease(
          defineAggregate({ name: 'codec' }),
          {
            version: 1,
            models: {},
            actors: {},
            system: { observeCodec: contract },
          },
        );
        const system = makeSystem({
          name: 'codec',
          aggregates: { codec: { releases: { 1: aggregate } } },
          services: {},
        });
        const command = {
          id: 'cmd_codec' as const,
          commandName: 'observeCodec',
          contractVersion: 1,
          kind: 'system' as const,
          aggregateName: 'codec',
          aggregateVersion: 1,
          aggregateId: 'one',
          payload: { content: 'value!' },
        };
        const harness = yield* makeSystemHarness({ system });
        yield* harness.push(command);
        expect(observations).toEqual([
          {
            encodes: 1,
            decodes: 1,
            command: { content: 'value!' },
            payload: { content: 'value!' },
          },
        ]);
        const before = { encodes, decodes };
        const prepared = yield* prepareAggregateInvocation({
          contract,
          command,
          claims: null,
        });
        expect(prepared.command.payload).toEqual({ content: 'value!' });
        expect({ encodes, decodes }).toEqual(before);
      }).pipe(
        Effect.provideService(CuidFactory, () => Effect.succeed('codec')),
      ),
  );
});
