import { describe, expect, it } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
import { makeAgentViewMaterialization } from '@zerospin/core/agent/materializeAgentView';
import { pendingAgentWakesDbConfig } from '@zerospin/core/agent/pendingAgentWakesDbConfig';
import type { IAgentStagedCommand } from '@zerospin/core/agent/runAgentWake';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeActorContractReadDb } from '@zerospin/core/contracts/make/makeActorContractReadDb';
import { scopeContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { makeServiceContractExtension } from '@zerospin/core/contracts/makeServiceContractExtension';
import { operationCodecs } from '@zerospin/core/contracts/operationCodecs';
import { prepareCommandOperation } from '@zerospin/core/contracts/prepareCommandOperation';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import {
  assertReadProjection,
  captureReadProjections,
  makeProjectedReadModels,
} from '@zerospin/core/contracts/readProjection';
import { makeContractSpec } from '@zerospin/core/declaration/makeContractSpec';
import { makeReleaseSpec } from '@zerospin/core/declaration/makeReleaseSpec';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { makeGuard } from '@zerospin/core/guards/make/makeGuard';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { encodeRowAsResource } from '@zerospin/core/models/encodeRowAsResource';
import { getGraph } from '@zerospin/core/models/getGraph';
import { makeLimitedModelVersion } from '@zerospin/core/models/make/makeLimitedModelVersion';
import {
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/make/makeModelVersion';
import {
  captureSelections,
  makeQueryDbVersion,
} from '@zerospin/core/models/make/makeQueryDbVersion';
import { modelRef } from '@zerospin/core/models/modelRef';
import { compileReadQuery } from '@zerospin/core/models/reads/compileReadQuery';
import { makeSelectedResourceDelta } from '@zerospin/core/models/reads/makeSelectedResourceDelta';
import { ReadQueryResultSchema } from '@zerospin/core/models/reads/ReadQuerySchema';
import { readSelectedResources } from '@zerospin/core/models/reads/readSelectedResources';
import { applySelectedResourcesTx } from '@zerospin/core/Node/applySelectedResourcesTx';
import {
  makeEncodedRowFromResource,
  makeResourceFromEncodedRow,
} from '@zerospin/core/Node/resourceEnvelope';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemHarness } from '@zerospin/core/testing/systemHarness/makeSystemHarness';
import { CuidFactory, primitives } from '@zerospin/shapes';
import { getColumns, noopEncoder, sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { TestClock } from 'effect/testing';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

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
      slug: primitives.text(),
      note: primitives.text({ nullable: true }),
      details: primitives.json({
        schema: Schema.Struct({
          labels: Schema.Array(Schema.String),
          enabled: Schema.Boolean,
        }),
      }),
    },
    indexes: [
      {
        name: 'entry_folder_slug_unique',
        columns: ['folderId', 'slug'],
        unique: true,
      },
    ],
  },
);
it('binds Service extensions to the exact contract and owned mutation model', () => {
  const source = makeServiceContractRelease(
    defineServiceContract('changeFolder'),
    { version: 1, payload: {} },
  );
  const other = makeServiceContractRelease(
    defineServiceContract('changeFolder'),
    { version: 1, payload: {} },
  );
  const extension = makeServiceContractExtension(source, {
    models: {},
    operations: { create: folderV1.operations.create },
    program: () => Effect.void,
  });
  const props = { version: 1, extensions: { changeFolder: extension } };
  expect(() =>
    makeServiceRelease(
      { name: 'files' },
      {
        ...props,
        models: { folder: folderV1 },
        system: { changeFolder: other },
      },
    ),
  ).toThrow('exact source contract');
  expect(() =>
    makeServiceRelease(
      { name: 'files' },
      { ...props, models: {}, system: { changeFolder: source } },
    ),
  ).toThrow('must belong to its owner release');
});
it('projects the same Service facts before and after composing its successor and another Service', () => {
  const book = makeServiceContractRelease(defineServiceContract('Book'), {
    version: 1,
    payload: {},
  });
  const reservations = defineService({ name: 'reservations' });
  const original = makeServiceRelease(reservations, {
    version: 1,
    models: { folder: folderV1 },
    system: { Book: book },
  });
  const expected = makeReleaseSpec(original);
  const successor = upgradeServiceContractRelease(book, { version: 2 });
  const upgraded = makeServiceRelease(reservations, {
    version: 2,
    models: { folder: folderV1 },
    system: { Book: successor },
  });
  const inventory = makeServiceRelease(defineService({ name: 'inventory' }), {
    version: 1,
    models: {},
  });
  makeSystem({
    name: 'booking',
    aggregates: {},
    services: {
      reservations: { releases: { 1: original, 2: upgraded }, canonical: 1 },
      inventory: { releases: { 1: inventory }, canonical: 1 },
    },
  });
  expect(book.next).toBe(successor);
  expect(Object.keys(makeReleaseSpec(upgraded).contracts.Book ?? {})).toEqual([
    '1',
    '2',
  ]);
  expect(Object.keys(makeReleaseSpec(original).contracts.Book ?? {})).toEqual([
    '1',
  ]);
  expect(makeReleaseSpec(original)).toEqual(expected);
  expect(expected).toMatchObject({
    service: { name: 'reservations', version: 1, system: { Book: 1 } },
    contracts: { Book: { 1: { commandName: 'Book', version: 1 } } },
    models: { folder: { 1: { attributes: ['label'] } } },
  });
});

it('distinguishes swapped command operation keys with the same portable destinations', () => {
  const hold = makeServiceContractRelease(defineServiceContract('Hold'), {
    version: 1,
    payload: {},
  });
  const morning = makeCommandOperation({
    destination: { service: defineService({ name: 'morning' }), version: 1 },
    contract: hold,
  });
  const evening = makeCommandOperation({
    destination: { service: defineService({ name: 'evening' }), version: 1 },
    contract: hold,
  });
  const book = defineServiceContract('Book');
  const original = makeServiceContractRelease(book, {
    version: 1,
    payload: {},
    operations: { first: morning, second: evening },
  });
  const swapped = makeServiceContractRelease(book, {
    version: 1,
    payload: {},
    operations: { first: evening, second: morning },
  });
  const reservations = defineService({ name: 'reservations' });
  const firstBuild = makeServiceRelease(reservations, {
    version: 1,
    models: {},
    system: { Book: original },
  });
  const secondBuild = makeServiceRelease(reservations, {
    version: 1,
    models: {},
    system: { Book: swapped },
  });
  expect(makeContractSpec(original)).toEqual(makeContractSpec(swapped));
  const first = makeReleaseSpec(firstBuild);
  const second = makeReleaseSpec(secondBuild);
  expect(
    first.contracts.Book?.[1]?.commandOperations.first?.destinationName,
  ).toBe('morning');
  expect(
    second.contracts.Book?.[1]?.commandOperations.first?.destinationName,
  ).toBe('evening');
  expect(first).not.toEqual(second);
});

it.effect(
  'requires the exact outgoing declaration at execution and the destination grant at composition',
  () =>
    Effect.gen(function* () {
      const inventory = defineService({ name: 'inventory' });
      const hold = makeServiceContractRelease(defineServiceContract('Hold'), {
        version: 1,
        payload: {},
      });
      const reserve = makeCommandOperation({
        destination: { service: inventory, version: 1 },
        contract: hold,
      });
      const book = makeServiceContractRelease(defineServiceContract('Book'), {
        version: 1,
        payload: {},
        operations: { reserve },
      });
      const reservations = makeServiceRelease(
        defineService({ name: 'reservations' }),
        {
          version: 1,
          models: {},
          system: { Book: book },
        },
      );
      const operation = yield* reserve.make({ payload: {} });
      const refused = yield* Effect.exit(
        prepareCommandOperation({
          sourceRelease: reservations,
          declaration: { commandName: 'Book' },
          operation: {
            ...operation,
            destination: { ...operation.destination },
          },
        }),
      );
      expect(
        Exit.isFailure(refused) && Cause.squash(refused.cause),
      ).toMatchObject({
        code: 'command-operation-destination-unregistered',
      });
      const ungranted = makeServiceRelease(inventory, {
        version: 1,
        models: {},
        contracts: { Hold: hold },
      });
      expect(() =>
        makeSystem({
          name: 'booking',
          aggregates: {},
          services: {
            reservations: { releases: { 1: reservations }, canonical: 1 },
            inventory: { releases: { 1: ungranted }, canonical: 1 },
          },
        }),
      ).toThrow(
        'must reference its exact claims-free ordinary contract System grant',
      );
    }),
);

const createdAt = new Date('2020-01-02T03:04:05.000Z');
const updatedAt = new Date('2020-02-03T04:05:06.000Z');
const folderRow = {
  id: 'fld_one' as const,
  createdAt,
  updatedAt,
  label: 'One',
};
const entryRow = {
  id: 'ent_one' as const,
  createdAt,
  updatedAt,
  folderId: folderRow.id,
  slug: 'first',
  note: null,
  details: { labels: ['first', '雪'], enabled: true },
};

function openGraph() {
  return Effect.gen(function* () {
    const opened = yield* openTestDb({ folder: folderV1, entry: entryV1 });
    opened.db
      .insert(folderV1.drizzleSchema)
      .values(yield* folderV1.table.encodeRow(folderRow))
      .run();
    opened.db
      .insert(entryV1.drizzleSchema)
      .values(yield* entryV1.table.encodeRow(entryRow))
      .run();
    return opened;
  });
}

describe('Model rows, resource envelopes and query boundaries', () => {
  it.effect('publishes only changed or removed selected resources', () =>
    Effect.gen(function* () {
      const folder = yield* encodeRowAsResource(folderV1, folderRow);
      const entry = yield* encodeRowAsResource(entryV1, entryRow);
      const removed = { ...entry, id: 'ent_removed' };
      const renamed = { ...entry, slug: 'renamed' };
      expect(
        makeSelectedResourceDelta({
          before: [folder, entry, removed],
          after: [{ ...folder }, renamed],
        }),
      ).toEqual({
        upserted: [renamed],
        deleted: [{ modelName: removed.modelName, id: removed.id }],
      });
    }),
  );

  it.effect(
    'applies a selected-row unique-key swap without rearming a consumed wake',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openTestDb({});
        yield* provisionDb({
          db,
          definition: pendingAgentWakesDbConfig.definition,
        });
        const view = makeQueryDbVersion({
          models: { folder: folderV1, entry: entryV1 },
        });
        const processed: string[] = [];
        const agent = makeServiceAgentRelease({
          serviceName: 'files',
          serviceVersion: 1,
          agentName: 'expiry',
          agentVersion: 1,
          sessionName: 'expiry',
          db: view,
          contracts: {},
          selections: {
            folder: view.query.folder.findMany({}),
            entry: view.query.entry.findMany({}),
          },
          wakeRules: {
            expiry: {
              selection: 'entry',
              wakeAt: ({ row }) => row.updatedAt.getTime(),
              onWake: {
                program: ({ db, resourceId }) =>
                  Effect.sync(() => {
                    const entry = db.query.entry
                      .findFirst({ where: { id: resourceId } })
                      .sync();
                    processed.push(entry!.slug);
                  }),
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
          },
        });
        const materialization = makeAgentViewMaterialization(agent, {});
        const first = yield* encodeRowAsResource(entryV1, entryRow);
        const second = { ...first, id: 'ent_two', slug: 'second' };
        yield* makeTx('installAndConsumeFirst')(function* (tx) {
          materialization.install(tx, [first, second]);
          yield* materialization.consumeWake(
            tx,
            {
              ruleName: 'expiry',
              resourceId: first.id,
              at: updatedAt.getTime(),
            },
            {
              pending: [],
              enqueue: () => Effect.die('unexpected staged command'),
            },
          );
        })(db);
        yield* makeTx('swapSelectedSlugs')(function* (tx) {
          materialization.applyDelta(tx, {
            upserted: [
              { ...first, slug: second.slug },
              { ...second, slug: entryRow.slug },
            ],
            deleted: [],
          });
        })(db);
        const due = materialization.dueWakes(db, updatedAt.getTime());
        expect(due.map(wake => wake.resourceId)).toEqual([second.id]);
        yield* makeTx('consumeSecond')(function* (tx) {
          yield* materialization.consumeWake(tx, due[0]!, {
            pending: [],
            enqueue: () => Effect.die('unexpected staged command'),
          });
        })(db);
        expect(processed).toEqual(['first', 'first']);
      }),
  );

  it.effect(
    'stages against the selected view and rolls failed callback stages back before recovery',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openTestDb({});
        yield* provisionDb({
          db,
          definition: pendingAgentWakesDbConfig.definition,
        });
        const modelsDb = makeQueryDbVersion({ models: { folder: folderV1 } });
        const requestedEvaluations: number[] = [];
        const renameFolder = makeServiceContractRelease(
          defineServiceContract('renameFolder'),
          {
            version: 1,
            result: Schema.String,
            payload: { label: primitives.text() },
            operations: { update: folderV1.operations.update },
            program: ({ payload, operations }) =>
              Effect.gen(function* () {
                if (payload.label === 'requested') {
                  requestedEvaluations.push(yield* Clock.currentTimeMillis);
                }
                yield* operations.update({
                  resourceId: folderRow.id,
                  attributes: { label: payload.label },
                });
                return payload.label;
              }),
          },
        );
        const ref = makeAgentCommandRef<typeof renameFolder>('renameFolder', 1);
        let recover = false;
        let firedWhileHidden = false;
        const agent = makeServiceAgentRelease({
          serviceName: 'files',
          serviceVersion: 1,
          agentName: 'observer',
          agentVersion: 1,
          sessionName: 'observer',
          db: modelsDb,
          contracts: { renameFolder: ref },
          selections: {
            folder: modelsDb.query.folder.findMany({
              where: { label: { ne: 'hidden' } },
            }),
          },
          wakeRules: {
            notify: {
              selection: 'folder',
              wakeAt: () => 1,
              onWake: {
                program: ({ db, stageCommand }) =>
                  Effect.gen(function* () {
                    const result = yield* stageCommand(ref, {
                      label: 'requested',
                    });
                    expect(result).toBe('requested');
                    expect(db.query.folder.findFirst().sync()?.label).toBe(
                      'requested',
                    );
                  }),
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
            hide: {
              selection: 'folder',
              wakeAt: () => 2,
              onWake: {
                program: ({ db, stageCommand }) =>
                  Effect.gen(function* () {
                    expect(db.query.folder.findFirst().sync()?.label).toBe(
                      'requested',
                    );
                    yield* stageCommand(ref, { label: 'hidden' });
                    expect(db.query.folder.findFirst().sync()).toBeUndefined();
                    const refusal = yield* Effect.flip(
                      stageCommand(ref, { label: 'must refuse' }),
                    );
                    expect(refusal).toMatchObject({
                      code: 'operation-row-not-found',
                    });
                    yield* Effect.fail('roll back hide');
                  }),
                onFailure: ({ db, stageCommand }) =>
                  Effect.gen(function* () {
                    expect(db.query.folder.findFirst().sync()?.label).toBe(
                      'requested',
                    );
                    if (!recover) return yield* Effect.fail('retry');
                    yield* stageCommand(ref, { label: 'hidden' });
                  }),
              },
            },
            observe: {
              selection: 'folder',
              wakeAt: () => 3,
              onWake: {
                program: ({ db, resourceId }) =>
                  Effect.sync(() => {
                    expect(resourceId).toBe(folderRow.id);
                    expect(db.query.folder.findFirst().sync()).toBeUndefined();
                    firedWhileHidden = true;
                  }),
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
          },
        });
        const view = makeAgentViewMaterialization(agent, { renameFolder });
        const resource = yield* encodeRowAsResource(folderV1, folderRow);
        yield* makeTx('installSelectedFolder')(function* (tx) {
          view.install(tx, [resource]);
        })(db);
        const pending: IAgentStagedCommand[] = [];
        const fire = makeTx('fireFolderWake')(function* (
          tx,
          occurrence: { ruleName: string; resourceId: string; at: number },
        ) {
          yield* view.consumeWake(tx, occurrence, {
            pending,
            enqueue: (_tx, stage) =>
              Effect.sync(() => {
                pending.push(stage);
              }),
          });
        });
        const [notify, hide, observe] = view.dueWakes(db, 3);
        yield* fire(db, notify!);
        expect(pending).toHaveLength(1);
        yield* TestClock.adjust('1 second');
        expect(yield* Effect.flip(fire(db, hide!))).toBe('retry');
        expect(view.dueWakes(db, 3)).toEqual([hide, observe]);
        expect(pending).toHaveLength(1);
        recover = true;
        yield* fire(db, hide!);
        expect(pending.map(stage => JSON.parse(stage.payload).label)).toEqual([
          'requested',
          'hidden',
        ]);
        yield* fire(db, observe!);
        expect(firedWhileHidden).toBe(true);
        expect(new Set(requestedEvaluations)).toEqual(
          new Set([pending[0]!.appliedAt]),
        );
        expect(view.dueWakes(db, 3)).toEqual([]);
      }).pipe(
        Effect.provideService(CuidFactory, () =>
          Effect.succeed(crypto.randomUUID()),
        ),
      ),
  );

  it.effect(
    'delivers the original staged command when a later harness wake fails',
    () =>
      Effect.gen(function* () {
        const openFolder = makeServiceContractRelease(
          defineServiceContract('openFolder'),
          {
            version: 1,
            payload: {},
            operations: { create: folderV1.operations.create },
            program: ({ operations }) =>
              operations
                .create({
                  resourceId: folderRow.id,
                  attributes: { label: 'open' },
                })
                .pipe(Effect.asVoid),
          },
        );
        const evaluatedIds: string[] = [];
        const recordDate = makeServiceContractRelease(
          defineServiceContract('recordDate'),
          {
            version: 1,
            payload: { at: primitives.json({ schema: Schema.DateFromString }) },
            program: ({ command }) =>
              Effect.sync(() => {
                if (command.kind === 'agent') evaluatedIds.push(command.id);
              }),
          },
        );
        const extendRecordDate = makeServiceContractExtension(recordDate, {
          models: {},
          operations: { update: folderV1.operations.update },
          program: ({ payload, operations }) =>
            Effect.gen(function* () {
              yield* operations.update({
                resourceId: folderRow.id,
                attributes: { label: payload.at.toISOString() },
              });
            }),
        });
        const db = makeQueryDbVersion({ models: { folder: folderV1 } });
        const granted = makeAgentCommandRef<typeof recordDate>('recordDate', 1);
        let failLaterWake = true;
        const agent = makeServiceAgentRelease({
          serviceName: 'files',
          serviceVersion: 1,
          agentName: 'clock',
          agentVersion: 1,
          sessionName: 'clock',
          db,
          contracts: { recordDate: granted },
          selections: { folder: db.query.folder.findMany() },
          wakeRules: {
            record: {
              selection: 'folder',
              wakeAt: ({ row }) => (row.label === 'open' ? 0 : null),
              onWake: {
                program: ({ stageCommand }) =>
                  stageCommand(granted, { at: updatedAt }).pipe(Effect.asVoid),
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
            verify: {
              selection: 'folder',
              wakeAt: () => 0,
              onWake: {
                program: () =>
                  failLaterWake ? Effect.fail('verify failed') : Effect.void,
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
          },
        });
        const owner = makeServiceRelease(defineService({ name: 'files' }), {
          version: 1,
          models: { folder: folderV1 },
          extensions: { recordDate: extendRecordDate },
          contracts: { recordDate },
          system: { openFolder },
        });
        const system = makeSystem({
          name: 'datedAgent',
          aggregates: {},
          services: { files: { releases: { 1: owner }, canonical: 1 } },
          serviceAgents: {
            files: { clock: { releases: { 1: agent }, active: 1 } },
          },
        });
        const harness = yield* makeSystemHarness({ system });
        yield* harness.push({
          kind: 'system',
          id: 'cmd_open',
          commandName: 'openFolder',
          contractVersion: 1,
          serviceName: 'files',
          serviceVersion: 1,
          payload: {},
        });
        expect(Exit.isFailure(yield* Effect.exit(harness.flush()))).toBe(true);
        const evaluationsBeforeRetry = evaluatedIds.length;
        expect(evaluationsBeforeRetry).toBeGreaterThan(0);
        failLaterWake = false;
        yield* harness.flush();
        yield* harness.flush();
        expect(evaluatedIds).toHaveLength(evaluationsBeforeRetry + 1);
        expect(new Set(evaluatedIds).size).toBe(1);
        const row = yield* harness.query(
          { release: owner },
          db.query.folder.findFirst(),
        );
        expect(row?.label).toBe(updatedAt.toISOString());
      }).pipe(
        Effect.provideService(CuidFactory, () =>
          Effect.succeed(crypto.randomUUID()),
        ),
      ),
  );

  it.effect(
    'resumes each owner confirmation at its first unfinished Agent before admitting a later command',
    () =>
      Effect.gen(function* () {
        const ownerExecutions: string[] = [];
        const writeFolder = makeServiceContractRelease(
          defineServiceContract('writeFolder'),
          {
            version: 1,
            payload: { label: primitives.text() },
            result: Schema.String,
            operations: {
              create: folderV1.operations.create,
              update: folderV1.operations.update,
            },
            program: ({ payload, operations }) =>
              Effect.gen(function* () {
                ownerExecutions.push(payload.label);
                const values = {
                  resourceId: folderRow.id,
                  attributes: { label: payload.label },
                };
                if (payload.label === 'first') yield* operations.create(values);
                else yield* operations.update(values);
                return payload.label;
              }),
          },
        );
        const db = makeQueryDbVersion({ models: { folder: folderV1 } });
        const firstConfirmed: string[] = [];
        const secondConfirmed: string[] = [];
        let failSecond = true;
        const watch = (name: string, observed: string[]) =>
          makeServiceAgentRelease({
            serviceName: 'files',
            serviceVersion: 1,
            agentName: name,
            agentVersion: 1,
            sessionName: name,
            db,
            contracts: {},
            selections: { folder: db.query.folder.findMany() },
            wakeRules: {
              record: {
                selection: 'folder',
                wakeAt: ({ row }) => {
                  observed.push(row.label);
                  if (name === 'secondObserver' && failSecond) {
                    throw new Error('simulated deadline failure');
                  }
                  return null;
                },
                onWake: {
                  program: () => Effect.void,
                  onFailure: ({ failure }) => Effect.fail(failure),
                },
              },
            },
          });
        const owner = makeServiceRelease(defineService({ name: 'files' }), {
          version: 1,
          models: { folder: folderV1 },
          system: { writeFolder },
        });
        const system = makeSystem({
          name: 'confirmInOrder',
          aggregates: {},
          services: { files: { releases: { 1: owner }, canonical: 1 } },
          serviceAgents: {
            files: {
              firstObserver: {
                releases: { 1: watch('firstObserver', firstConfirmed) },
                active: 1,
              },
              secondObserver: {
                releases: { 1: watch('secondObserver', secondConfirmed) },
                active: 1,
              },
            },
          },
        });
        const harness = yield* makeSystemHarness({ system });
        const push = (label: string) =>
          harness.push({
            kind: 'system',
            commandName: 'writeFolder',
            contractVersion: 1,
            id: `cmd_${label}`,
            serviceName: 'files',
            serviceVersion: 1,
            payload: { label },
          });
        expect(Exit.isFailure(yield* Effect.exit(push('first')))).toBe(true);
        expect(Exit.isFailure(yield* Effect.exit(push('later')))).toBe(true);
        expect(Exit.isFailure(yield* Effect.exit(push('first')))).toBe(true);
        expect(ownerExecutions).toEqual(['first']);
        failSecond = false;
        yield* harness.flush();
        expect(firstConfirmed).toEqual(['first']);
        expect(secondConfirmed).toEqual(['first', 'first', 'first', 'first']);
        expect(yield* push('first')).toBe('first');
        expect(yield* push('later')).toBe('later');
        expect(ownerExecutions).toEqual(['first', 'later']);
        expect(firstConfirmed.slice(-2)).toEqual(['first', 'later']);
        expect(secondConfirmed.slice(-2)).toEqual(['first', 'later']);
      }).pipe(
        Effect.provideService(CuidFactory, () =>
          Effect.succeed(crypto.randomUUID()),
        ),
      ),
  );

  it.effect(
    'installs an Agent observer delta that swaps unique values while retaining related rows',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openGraph();
        const models = { folder: folderV1, entry: entryV1 };
        expect(db.all(sql`PRAGMA foreign_key_list(entry)`)).toEqual([
          expect.objectContaining({ table: 'folder', on_delete: 'NO ACTION' }),
        ]);
        const folderResource = yield* encodeRowAsResource(folderV1, folderRow);
        const first = yield* encodeRowAsResource(entryV1, entryRow);
        const install = makeTx('applyObserverDelta')(function* (
          tx,
          upserted: readonly (typeof first | typeof folderResource)[],
        ) {
          yield* applySelectedResourcesTx({
            tx,
            models,
            delta: { upserted, deleted: [] },
          });
        });
        const second = { ...first, id: 'ent_two' as const, slug: 'second' };
        const other = { ...first, id: 'ent_other' as const, slug: 'untouched' };
        yield* install(db, [second, other]);
        yield* install(db, [
          { ...folderResource, label: 'Updated' },
          { ...first, slug: second.slug },
          { ...second, slug: first.slug },
        ]);
        const rows = db.query.entry.findMany({}).sync();
        expect(rows.map(row => [row.id, row.slug]).sort()).toEqual([
          ['ent_one', 'second'],
          ['ent_other', 'untouched'],
          ['ent_two', 'first'],
        ]);
      }),
  );

  it.effect(
    'evaluates Agent relations and wakes from selected dependency rows',
    () =>
      Effect.gen(function* () {
        const { db: ownerDb } = yield* openGraph();
        const { db: agentDb } = yield* openTestDb({});
        yield* provisionDb({
          db: agentDb,
          definition: pendingAgentWakesDbConfig.definition,
        });
        const view = makeQueryDbVersion({
          models: { folder: folderV1, entry: entryV1 },
        });
        let retainedRead: (() => unknown) | undefined;
        const agent = makeServiceAgentRelease({
          serviceName: 'files',
          serviceVersion: 1,
          agentName: 'observer',
          agentVersion: 1,
          sessionName: 'observer',
          db: view,
          contracts: {},
          selections: {
            folder: view.query.folder.findMany(),
            entry: view.query.entry.findMany({
              where: { id: { ne: 'ent_hidden' }, folder: true },
              orderBy: { slug: 'asc' },
              offset: 1,
              limit: 1,
            }),
          },
          wakeRules: {
            expiry: {
              selection: 'folder',
              wakeAt: ({ row, db }) => {
                retainedRead = db.query.entry.findMany().sync;
                const folder = db.query.folder
                  .findFirst({ where: { id: row.id }, with: { entries: true } })
                  .sync();
                return folder?.entries[0]?.updatedAt.getTime() ?? null;
              },
              onWake: {
                program: ({ db, resourceId }) =>
                  Effect.sync(() => {
                    const folder = db.query.folder
                      .findFirst({
                        where: { id: resourceId },
                        with: { entries: true },
                      })
                      .sync();
                    expect(folder?.entries.map(entry => entry.id)).toEqual([
                      'ent_selected',
                    ]);
                  }),
                onFailure: ({ failure }) => Effect.fail(failure),
              },
            },
          },
        });
        const selected = () =>
          getGraph({
            db: ownerDb,
            models: view.models,
            selections: agent.selections,
            identity: {},
          });
        const materialization = makeAgentViewMaterialization(agent, {});
        const initial = selected();
        expect(initial.map(row => row.id)).toEqual(['fld_one']);
        yield* makeTx('installSelectedRows')(function* (tx) {
          materialization.install(tx, initial);
        })(agentDb);
        expect(retainedRead).toThrow('Agent wakeAt database is closed');

        ownerDb
          .insert(entryV1.drizzleSchema)
          .values(
            yield* entryV1.table.encodeRow({
              ...entryRow,
              id: 'ent_hidden',
              slug: 'hidden',
            }),
          )
          .run();
        const afterHidden = selected();
        expect(afterHidden).toEqual(initial);
        yield* makeTx('applyAfterHiddenEntry')(function* (tx) {
          materialization.applyDelta(tx, {
            upserted: afterHidden,
            deleted: [],
          });
        })(agentDb);
        const at = updatedAt.getTime();
        expect(materialization.dueWakes(agentDb, at)).toEqual([]);

        ownerDb
          .insert(entryV1.drizzleSchema)
          .values(
            yield* entryV1.table.encodeRow({
              ...entryRow,
              id: 'ent_selected',
              slug: 'selected',
            }),
          )
          .run();
        const afterSelected = selected();
        expect(afterSelected.map(row => row.id).sort()).toEqual([
          'ent_selected',
          'fld_one',
        ]);
        yield* makeTx('applyAfterSelectedEntry')(function* (tx) {
          materialization.applyDelta(tx, {
            upserted: afterSelected.filter(row => row.modelName === 'entry'),
            deleted: [],
          });
        })(agentDb);
        expect(materialization.dueWakes(agentDb, at)).toEqual([
          { ruleName: 'expiry', resourceId: 'fld_one', at },
        ]);
        const child = afterSelected.find(row => row.modelName === 'entry')!;
        const occurrence = { ruleName: 'expiry', resourceId: 'fld_one', at };
        yield* makeTx('reconcileChildChanges')(function* (tx) {
          const moved = { ...child, updatedAt: new Date(at + 123) };
          materialization.applyDelta(tx, { upserted: [moved], deleted: [] });
          expect(materialization.dueWakes(tx, at)).toEqual([]);
          expect(materialization.dueWakes(tx, at + 123)).toEqual([
            { ...occurrence, at: at + 123 },
          ]);
          materialization.applyDelta(tx, { upserted: [child], deleted: [] });
          yield* materialization.consumeWake(tx, occurrence, {
            pending: [],
            enqueue: () => Effect.die('unexpected staged command'),
          });
          materialization.applyDelta(tx, {
            upserted: [{ ...child, slug: 'renamed' }],
            deleted: [],
          });
          expect(materialization.dueWakes(tx, at)).toEqual([]);
          materialization.applyDelta(tx, { upserted: [], deleted: [child] });
          materialization.applyDelta(tx, { upserted: [child], deleted: [] });
          expect(materialization.dueWakes(tx, at)).toEqual([occurrence]);
        })(agentDb);
      }),
  );

  it.effect(
    'retains model-scoped ids and resolves Actor references to the selected model',
    () =>
      Effect.gen(function* () {
        const child = makeModelVersion(
          defineModel({ name: 'child', abbreviation: 'fld' }),
          {
            version: 1,
            attributes: {
              folderId: modelRef({
                model: folder,
                nullable: false,
                relation: 'folder',
                inverse: 'children',
              }),
            },
            indexes: [],
          },
        );
        const models = { folder: folderV1, child };
        const { db } = yield* openTestDb(models);
        db.insert(folderV1.drizzleSchema)
          .values(yield* folderV1.table.encodeRow(folderRow))
          .run();
        db.insert(child.drizzleSchema)
          .values(
            yield* child.table.encodeRow({
              id: folderRow.id,
              folderId: folderRow.id,
              createdAt,
              updatedAt,
            }),
          )
          .run();
        const queryDb = makeQueryDbVersion({ models });
        const selection = (label: string) =>
          captureSelections(queryDb, {
            folder: queryDb.query.folder.findMany({
              where: { label: { eq: label } },
            }),
            child: queryDb.query.child.findMany({}),
          });
        const read = (label: string) =>
          readSelectedResources({
            db,
            models,
            exposedModels: models,
            requireReferenceClosure: true,
            selections: selection(label),
          });
        const resources = yield* read(folderRow.label);
        expect(resources.map(({ modelName, id }) => [modelName, id])).toEqual([
          ['folder', folderRow.id],
          ['child', folderRow.id],
        ]);
        expect(yield* Effect.flip(read('excluded'))).toMatchObject({
          code: 'projection-projected-resource-invalid',
        });
      }),
  );

  it('rejects cyclic Agent selection dependencies', () => {
    const db = makeQueryDbVersion({
      models: { folder: folderV1, entry: entryV1 },
    });
    expect(() =>
      makeServiceAgentRelease({
        serviceName: 'files',
        serviceVersion: 1,
        agentName: 'observer',
        agentVersion: 1,
        sessionName: 'observer',
        db,
        contracts: {},
        selections: {
          folder: db.query.folder.findMany({ where: { entries: true } }),
          entry: db.query.entry.findMany({ where: { folder: true } }),
        },
      }),
    ).toThrow('Cyclic Agent selection dependency');
  });

  it('checks granted contract reads and mutations against the registered Agent models', () => {
    const readFolder = makeServiceContractRelease(
      defineServiceContract('readFolder'),
      {
        version: 1,
        payload: {},
        models: { folder: { model: folderV1, fields: ['label'] } },
      },
    );
    const writeFolder = makeServiceContractRelease(
      defineServiceContract('writeFolder'),
      {
        version: 1,
        payload: {},
        operations: { rename: folderV1.operations.update },
      },
    );
    const owner = makeServiceRelease(defineService({ name: 'files' }), {
      version: 1,
      models: { folder: folderV1 },
      contracts: { readFolder, writeFolder },
    });
    const db = makeQueryDbVersion({
      models: {
        folder: makeLimitedModelVersion(folder, {
          version: 1,
          attributes: {},
          indexes: [],
        }),
      },
    });
    const register = (contracts: {
      readFolder?: ReturnType<typeof makeAgentCommandRef<typeof readFolder>>;
      writeFolder?: ReturnType<typeof makeAgentCommandRef<typeof writeFolder>>;
    }) => {
      const agent = makeServiceAgentRelease({
        agentName: 'observer',
        agentVersion: 1,
        serviceName: 'files',
        serviceVersion: 1,
        sessionName: 'observer',
        db,
        selections: { folder: db.query.folder.findMany() },
        contracts,
      });
      return makeSystem({
        name: 'grantModels',
        aggregates: {},
        services: { files: { releases: { 1: owner }, canonical: 1 } },
        serviceAgents: {
          files: { observer: { releases: { 1: agent }, active: 1 } },
        },
      });
    };
    expect(() => register({})).not.toThrow();
    expect(() =>
      register({
        readFolder: makeAgentCommandRef<typeof readFolder>('readFolder', 1),
      }),
    ).toThrow(/folder.label/);
    expect(() =>
      register({
        writeFolder: makeAgentCommandRef<typeof writeFolder>('writeFolder', 1),
      }),
    ).toThrow(/model folder@1 must belong to its database/);
  });

  it('requires each named wake rule to use a declared selection', () => {
    const db = makeQueryDbVersion({ models: { folder: folderV1 } });
    const rule = {
      selection: 'folder' as const,
      wakeAt: () => null,
      onWake: { program: () => Effect.void, onFailure: () => Effect.void },
    };
    const release = () =>
      makeServiceAgentRelease({
        serviceName: 'files',
        serviceVersion: 1,
        agentName: 'observer',
        agentVersion: 1,
        sessionName: 'observer',
        db,
        contracts: {},
        selections: { folder: db.query.folder.findMany() },
        wakeRules: { first: rule, second: rule },
      });
    expect(Object.keys(release().wakeRules)).toEqual(['first', 'second']);
    Reflect.set(rule, 'selection', 'unknown');
    expect(release).toThrow('undeclared selection unknown');
  });

  it('rejects a nested Agent RAW predicate without evaluating its callback', () => {
    const db = makeQueryDbVersion({
      models: { folder: folderV1, entry: entryV1 },
    });
    let calls = 0;
    const selection = db.query.folder.findMany({
      where: {
        entries: {
          RAW: (row, { eq }) => {
            calls += 1;
            return eq(row.slug, 'first');
          },
        },
      },
    });
    expect(() =>
      makeServiceAgentRelease({
        serviceName: 'files',
        serviceVersion: 1,
        agentName: 'observer',
        agentVersion: 1,
        sessionName: 'observer',
        db,
        contracts: {},
        selections: {
          folder: selection,
          entry: db.query.entry.findMany(),
        },
      }),
    ).toThrow(/RAW/);
    expect(calls).toBe(0);
  });

  it('rejects an Agent relation predicate on a field omitted from its view', () => {
    const visibleEntry = makeLimitedModelVersion(
      { name: 'entry', abbreviation: 'ent' },
      {
        version: 1,
        attributes: { folderId: entryV1.attributes.folderId },
        indexes: [],
      },
    );
    const db = makeQueryDbVersion({
      models: { folder: folderV1, entry: visibleEntry },
    });
    const entries = {};
    Reflect.set(entries, 'slug', { eq: 'first' });
    expect(() =>
      makeServiceAgentRelease({
        serviceName: 'files',
        serviceVersion: 1,
        agentName: 'observer',
        agentVersion: 1,
        sessionName: 'observer',
        db,
        contracts: {},
        selections: {
          folder: db.query.folder.findMany({ where: { entries } }),
          entry: db.query.entry.findMany(),
        },
      }),
    ).toThrow(/slug/);
  });

  it.effect(
    'preserves Actor RAW query evaluation and canonical model checks',
    () =>
      Effect.gen(function* () {
        const { db: ownerDb } = yield* openGraph();
        const db = makeQueryDbVersion({ models: { folder: folderV1 } });
        let calls = 0;
        const selections = captureSelections(db, {
          folder: db.query.folder.findMany({
            where: {
              RAW: (row, { eq }) =>
                eq(row.label, ++calls === 1 ? 'One' : 'Other'),
            },
          }),
        });
        expect(calls).toBe(1);
        expect(selections.folder.bind({}).params).toEqual(['One']);
        expect(
          getGraph({
            db: ownerDb,
            models: db.models,
            selections,
            identity: {},
          }).map(row => row.id),
        ).toEqual(['fld_one']);
        expect(calls).toBe(1);
        const other = makeModelVersion(folder, {
          version: 2,
          attributes: { label: primitives.text() },
          indexes: [],
        });
        expect(() =>
          captureSelections(db, {
            folder: db.query.folder.findMany({
              where: {
                RAW: () => sql`exists (select 1 from ${other.drizzleSchema})`,
              },
            }),
          }),
        ).toThrow('canonical model');
      }),
  );

  it('requires a selection for every Agent view model', () => {
    const db = makeQueryDbVersion({
      models: { folder: folderV1, entry: entryV1 },
    });
    expect(() =>
      makeServiceAgentRelease({
        serviceName: 'files',
        serviceVersion: 1,
        agentName: 'observer',
        agentVersion: 1,
        sessionName: 'observer',
        db,
        contracts: {},
        selections: {
          folder: db.query.folder.findMany({ where: { entries: true } }),
        },
      }),
    ).toThrow('Agent view model entry requires a selection');
  });

  it('records scoped RAW columns separately from direct canonical references', () => {
    const db = makeQueryDbVersion({
      models: { folder: folderV1, entry: entryV1 },
    });
    const folder = getColumns(db.config.schema.folder!).label!;
    const entry = getColumns(db.config.schema.entry!).slug!;
    const root = (scoped: boolean) =>
      captureSelections(db, {
        folder: db.query.folder.findMany({
          where: { RAW: row => sql`${scoped ? row.label : folder} = ${'One'}` },
        }),
      }).folder;
    const nested = (scoped: boolean) =>
      captureSelections(db, {
        folder: db.query.folder.findMany({
          where: {
            entries: {
              RAW: row => sql`${scoped ? row.slug : entry} = ${'first'}`,
            },
          },
        }),
      }).folder;
    const legacy = (value: unknown) =>
      JSON.parse(
        JSON.stringify(value, (_key, part) => {
          if (!Array.isArray(part)) return part;
          if (part[0] === 'sql-selection-v2') return part[1];
          if (part[0] === 'scoped-column') return ['column', part[2], part[3]];
          return part;
        }),
      );
    expect(legacy(root(true).definition)).toEqual(
      legacy(root(false).definition),
    );
    expect(root(true).definition).not.toEqual(root(false).definition);
    expect(root(true).bind({}).sql).not.toEqual(root(false).bind({}).sql);
    expect(nested(true).definition).not.toEqual(nested(false).definition);
    expect(nested(true).bind({}).sql).not.toEqual(nested(false).bind({}).sql);
  });

  it('distinguishes an outer alias from a nested alias of the same model', () => {
    const tree = makeModelVersion(folder, {
      version: 2,
      attributes: {
        label: primitives.text(),
        parentId: modelRef({
          model: folder,
          nullable: true,
          relation: 'parent',
          inverse: 'children',
        }),
      },
      indexes: [],
    });
    const db = makeQueryDbVersion({ models: { folder: tree } });
    let outerId: ReturnType<typeof sql> | undefined;
    const selected = captureSelections(db, {
      folder: db.query.folder.findMany({
        where: {
          RAW: row => {
            outerId = sql`${row.id}`;
            return sql`1 = 1`;
          },
          parent: {
            RAW: row => {
              if (outerId === undefined) {
                throw new Error('Expected outer selection alias');
              }
              return sql`${row.id} = ${outerId}`;
            },
          },
        },
      }),
    }).folder;
    const definition = JSON.stringify(selected.definition);
    expect(definition).toContain('"scoped-column",[],"folder","id"');
    expect(definition).toContain('"scoped-column",["parent"],"folder","id"');
  });

  it.effect('captures parameter encoders once in nested Actor selections', () =>
    Effect.gen(function* () {
      const { db: ownerDb } = yield* openGraph();
      const db = makeQueryDbVersion({
        models: { folder: folderV1, entry: entryV1 },
      });
      let actorCalls = 0;
      const actor = captureSelections(db, {
        folder: db.query.folder.findMany({
          where: {
            entries: {
              RAW: row =>
                sql`${row.slug} = ${sql.param('input', {
                  mapToDriverValue: () =>
                    ++actorCalls === 1 ? 'first' : 'other',
                })}`,
            },
          },
        }),
      });
      expect(actorCalls).toBe(1);
      expect(JSON.stringify(actor.folder.definition)).toContain('first');
      expect(actor.folder.bind({}).params).toEqual(['first']);
      expect(
        getGraph({
          db: ownerDb,
          models: db.models,
          selections: actor,
          identity: {},
        }).map(row => row.id),
      ).toEqual(['fld_one']);
    }),
  );

  it('rejects custom identity encoders and retains normal Actor placeholders', () => {
    const db = makeQueryDbVersion({ models: { folder: folderV1 } });
    const identity = Schema.Struct({ folderId: Schema.String });
    const placeholder = sql.placeholder('folderId');
    const custom = db.query.folder.findMany({
      where: {
        RAW: row =>
          sql`${row.id} = ${sql.param(placeholder, {
            mapToDriverValue: value => `prefix_${String(value)}`,
          })}`,
      },
    });
    expect(() => captureSelections(db, { folder: custom }, identity)).toThrow(
      'Identity placeholders require a canonical column or default encoder',
    );
    const normal = db.query.folder.findMany({
      where: {
        RAW: row => sql`${row.id} = ${sql.param(placeholder, row.id)}`,
      },
    });
    const selected = captureSelections(db, { folder: normal }, identity);
    expect(selected.folder.bind({ folderId: 'fld_one' }).params).toEqual([
      'fld_one',
    ]);

    const column = getColumns(db.config.relations.folder!.table).id!;
    for (const prefix of ['a_', 'b_']) {
      const forged = new Proxy(column, {
        get(target, key) {
          if (key === 'mapToDriverValue') {
            return (value: unknown) => prefix + String(value);
          }
          return Reflect.get(target, key, target);
        },
      });
      const query = db.query.folder.findMany({
        where: {
          RAW: row => sql`${row.id} = ${sql.param(placeholder, forged)}`,
        },
      });
      expect(() => captureSelections(db, { folder: query }, identity)).toThrow(
        'Identity placeholders require a canonical column or default encoder',
      );
      const scoped = db.query.folder.findMany({
        where: {
          RAW: row => {
            const forgedAlias = new Proxy(row.id, {
              get(target, key) {
                if (key === 'mapToDriverValue') {
                  return (value: unknown) => prefix + String(value);
                }
                return Reflect.get(target, key, target);
              },
            });
            return sql`${row.id} = ${sql.param(placeholder, forgedAlias)}`;
          },
        },
      });
      expect(() => captureSelections(db, { folder: scoped }, identity)).toThrow(
        'Identity placeholders require a canonical column or default encoder',
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      column,
      'mapToDriverValue',
    );
    if (descriptor === undefined) throw new Error('Expected column encoder');
    Object.defineProperty(column, 'mapToDriverValue', {
      ...descriptor,
      value: (value: unknown) => `changed_${String(value)}`,
    });
    try {
      expect(selected.folder.bind({ folderId: 'fld_one' }).params).toEqual([
        'fld_one',
      ]);
      expect(() => captureSelections(db, { folder: normal }, identity)).toThrow(
        'Identity placeholders require a canonical column or default encoder',
      );
    } finally {
      Object.defineProperty(column, 'mapToDriverValue', descriptor);
    }
    const defaultQuery = db.query.folder.findMany({
      where: { RAW: row => sql`${row.id} = ${sql.param(placeholder)}` },
    });
    const defaultSelection = captureSelections(
      db,
      { folder: defaultQuery },
      identity,
    );
    const defaultDescriptor = Object.getOwnPropertyDescriptor(
      noopEncoder,
      'mapToDriverValue',
    );
    if (defaultDescriptor === undefined) {
      throw new Error('Expected default encoder');
    }
    Object.defineProperty(noopEncoder, 'mapToDriverValue', {
      ...defaultDescriptor,
      value: (value: unknown) => `changed_${String(value)}`,
    });
    try {
      expect(
        defaultSelection.folder.bind({ folderId: 'fld_one' }).params,
      ).toEqual(['fld_one']);
      expect(() =>
        captureSelections(db, { folder: defaultQuery }, identity),
      ).toThrow(
        'Identity placeholders require a canonical column or default encoder',
      );
    } finally {
      Object.defineProperty(noopEncoder, 'mapToDriverValue', defaultDescriptor);
    }
  });

  it('captures orderBy and nested SQL encoders once, including null parameters', () => {
    const db = makeQueryDbVersion({ models: { folder: folderV1 } });
    let calls = 0;
    let innerCalls = 0;
    let nullCalls = 0;
    const selected = captureSelections(db, {
      folder: db.query.folder.findMany({
        where: {
          RAW: row =>
            sql`${row.label} = ${sql.param('outer', {
              mapToDriverValue: () =>
                sql`${sql.param('inner', {
                  mapToDriverValue: () =>
                    ++innerCalls === 1 ? 'One' : 'Other',
                })}`,
            })} OR ${row.label} IS ${sql.param(null, {
              mapToDriverValue: () => {
                nullCalls++;
                return 'Other';
              },
            })}`,
        },
        orderBy: row =>
          sql`${row.label} = ${sql.param('order', {
            mapToDriverValue: () => (++calls === 1 ? 'One' : 'Other'),
          })}`,
      }),
    }).folder;
    expect([calls, innerCalls, nullCalls]).toEqual([1, 1, 0]);
    expect(selected.bind({}).params).toEqual(['One', null, 'One']);
    expect(JSON.stringify(selected.definition)).not.toContain('Other');
  });

  it.effect(
    'keeps Actor row selection and partial field exposure in projected reads',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openGraph();
        const queryDb = makeQueryDbVersion({
          models: { folder: folderV1, entry: entryV1 },
        });
        const identity = makeActorIdentity({
          claims: Schema.Struct({ folderId: Schema.String }),
          actorPath: RoutePattern.parse('/:folderId'),
        });
        const visibleEntry = makeLimitedModelVersion(
          { name: 'entry', abbreviation: 'ent' },
          {
            version: 1,
            attributes: {
              folderId: entryV1.attributes.folderId,
              slug: entryV1.attributes.slug,
            },
            indexes: [],
          },
        );
        const actor = makeServiceActorRelease(
          { name: 'reader' },
          {
            version: 1,
            db: queryDb,
            exposedModels: { folder: folderV1, entry: visibleEntry },
            identity,
            authentication: 'none',
            contracts: {},
            selections: {
              folder: queryDb.query.folder.findMany({
                where: { id: { eq: identity.sql.placeholder('folderId') } },
              }),
              entry: queryDb.query.entry.findMany({
                where: {
                  folderId: { eq: identity.sql.placeholder('folderId') },
                },
              }),
            },
          },
        );
        const models = makeProjectedReadModels(
          captureReadProjections({
            entry: { model: entryV1, fields: ['folderId', 'slug'] },
            folder: { model: folderV1, fields: ['label'] },
          }),
        );
        const entry = models.entry;
        if (entry === undefined) throw new Error('Missing Entry projection');
        expect(
          Reflect.set(entry.table.shape, 'note', entryV1.table.shape.note),
        ).toBe(false);
        const selected = scopeContractReadDb(
          makeActorContractReadDb({
            db,
            actor,
            identity: { folderId: folderRow.id },
          }),
          models,
        );
        expect(
          yield* selected.read(entry, { with: { folder: true } }, false),
        ).toEqual([
          {
            id: entryRow.id,
            folderId: folderRow.id,
            slug: entryRow.slug,
            folder: { id: folderRow.id, label: folderRow.label },
          },
        ]);
        const hidden = scopeContractReadDb(
          makeActorContractReadDb({
            db,
            actor,
            identity: { folderId: 'fld_hidden' },
          }),
          models,
        );
        expect(yield* hidden.read(entry, {}, false)).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.effect(
    'restricts projected reads and accepts compatible model additions',
    () =>
      Effect.gen(function* () {
        const { readDb } = yield* openGraph();
        const projections = captureReadProjections({
          entry: { model: entryV1, fields: ['folderId', 'slug'] },
          folder: { model: folderV1, fields: ['label'] },
        });
        const models = makeProjectedReadModels(projections);
        const scoped = scopeContractReadDb(readDb, models);
        const entry = models.entry;
        if (entry === undefined) throw new Error('Missing Entry projection');
        expect(
          yield* scoped.read(entry, { with: { folder: true } }, false),
        ).toEqual([
          {
            id: entryRow.id,
            folderId: folderRow.id,
            slug: entryRow.slug,
            folder: { id: folderRow.id, label: folderRow.label },
          },
        ]);
        const projectedFolder = models.folder;
        if (projectedFolder === undefined) {
          throw new Error('Missing Folder projection');
        }
        expect(
          yield* scoped.read(
            projectedFolder,
            { with: { entries: true } },
            true,
          ),
        ).toEqual({
          id: folderRow.id,
          label: folderRow.label,
          entries: [
            { id: entryRow.id, folderId: folderRow.id, slug: entryRow.slug },
          ],
        });
        expect(
          yield* scoped.read(
            entry,
            { columns: { id: false, folderId: false, slug: false } },
            true,
          ),
        ).toEqual({});
        const rejected = yield* scoped
          .read(entry, { where: { note: { eq: null } } }, false)
          .pipe(Effect.exit);
        expect(Exit.isFailure(rejected)).toBe(true);

        const entryV2 = upgradeModelVersion(entryV1, {
          version: 2,
          attributes: {
            slug: primitives.text({ defaultValue: 'new' }),
            extra: primitives.text(),
          },
        });
        const projection = projections.entry;
        if (projection === undefined) {
          throw new Error('Missing Entry requirement');
        }
        expect(() =>
          assertReadProjection({
            projection,
            projectedModels: new Set(['entry', 'folder']),
            model: entryV2,
            context: 'test',
          }),
        ).not.toThrow();
        const changed = upgradeModelVersion(entryV1, {
          version: 3,
          attributes: { slug: primitives.text({ nullable: true }) },
        });
        expect(() =>
          assertReadProjection({
            projection,
            projectedModels: new Set(['entry', 'folder']),
            model: changed,
            context: 'test',
          }),
        ).toThrow('entry.slug');
        const uniqueReference = upgradeModelVersion(entryV1, {
          version: 5,
          attributes: {
            folderId: modelRef({
              model: folder,
              nullable: false,
              unique: true,
              relation: 'folder',
              inverse: 'entries',
            }),
          },
        });
        const withInverse = new Set(['entry', 'folder']);
        expect(() =>
          assertReadProjection({
            projection,
            projectedModels: withInverse,
            model: uniqueReference,
            context: 'test',
          }),
        ).toThrow('entry.folderId');
        expect(() =>
          assertReadProjection({
            projection,
            projectedModels: new Set(['entry']),
            model: uniqueReference,
            context: 'test',
          }),
        ).not.toThrow();
        const uniqueProjection = captureReadProjections({
          entry: { model: uniqueReference, fields: ['folderId'] },
        }).entry;
        if (uniqueProjection === undefined) {
          throw new Error('Missing unique projection');
        }
        expect(() =>
          assertReadProjection({
            projection: uniqueProjection,
            projectedModels: withInverse,
            model: entryV1,
            context: 'test',
          }),
        ).toThrow('entry.folderId');
        const multiple = makeServiceContractRelease(
          defineServiceContract('multipleEntries'),
          {
            version: 1,
            payload: {},
            models: {
              entry: { model: entryV1, fields: ['folderId'] },
              folder: { model: folderV1, fields: [] },
            },
          },
        );
        const single = makeServiceContractRelease(
          defineServiceContract('singleEntry'),
          {
            version: 1,
            payload: {},
            models: {
              entry: { model: uniqueReference, fields: ['folderId'] },
              folder: { model: folderV1, fields: [] },
            },
          },
        );
        expect(
          makeContractSpec(multiple).models.entry?.fields.folderId?.unique,
        ).toBe(false);
        expect(
          makeContractSpec(single).models.entry?.fields.folderId?.unique,
        ).toBe(true);
        const uniqueDb = yield* openTestDb({
          folder: folderV1,
          entry: uniqueReference,
        });
        uniqueDb.db
          .insert(folderV1.drizzleSchema)
          .values(yield* folderV1.table.encodeRow(folderRow))
          .run();
        uniqueDb.db
          .insert(uniqueReference.drizzleSchema)
          .values(yield* uniqueReference.table.encodeRow(entryRow))
          .run();
        const uniqueModels = makeProjectedReadModels(single.models);
        const uniqueFolder = uniqueModels.folder;
        if (uniqueFolder === undefined) {
          throw new Error('Missing unique Folder projection');
        }
        const uniqueScoped = scopeContractReadDb(uniqueDb.readDb, uniqueModels);
        expect(
          yield* uniqueScoped.read(
            uniqueFolder,
            { with: { entries: true } },
            true,
          ),
        ).toEqual({
          id: folderRow.id,
          entries: { id: entryRow.id, folderId: folderRow.id },
        });
        const jsonProjection = captureReadProjections({
          entry: { model: entryV1, fields: ['details'] },
        }).entry;
        if (jsonProjection === undefined) {
          throw new Error('Missing JSON requirement');
        }
        const differentCodec = upgradeModelVersion(entryV1, {
          version: 4,
          attributes: {
            details: primitives.json({
              schema: Schema.Struct({
                labels: Schema.Array(Schema.String),
                enabled: Schema.Boolean,
              }),
            }),
          },
        });
        expect(() =>
          assertReadProjection({
            projection: jsonProjection,
            projectedModels: new Set(['entry']),
            model: differentCodec,
            context: 'test',
          }),
        ).toThrow('entry.details');
        const mutableSource = makeModelVersion(
          defineModel({ name: 'mutable', abbreviation: 'mut' }),
          { version: 1, attributes: { label: primitives.text() }, indexes: [] },
        );
        const captured = captureReadProjections({
          mutable: { model: mutableSource, fields: ['label'] },
        }).mutable;
        if (captured === undefined) {
          throw new Error('Missing captured requirement');
        }
        Reflect.set(mutableSource.table.shape.label, 'nullable', true);
        expect(() =>
          assertReadProjection({
            projection: captured,
            projectedModels: new Set(['mutable']),
            model: mutableSource,
            context: 'test',
          }),
        ).toThrow('mutable.label');
        const source = makeModelVersion(
          defineModel({ name: 'captured', abbreviation: 'cap' }),
          { version: 1, attributes: { label: primitives.text() }, indexes: [] },
        );
        const original = makeServiceContractRelease(
          defineServiceContract('capturedRead'),
          {
            version: 1,
            payload: {},
            models: { captured: { model: source, fields: ['label'] } },
          },
        );
        const originalRequirement = makeContractSpec(original).models;
        Reflect.set(source.table.shape.label, 'nullable', true);
        const upgraded = upgradeServiceContractRelease(original, {
          version: 2,
        });
        expect(makeContractSpec(original).models).toEqual(originalRequirement);
        expect(makeContractSpec(upgraded).models).toEqual(originalRequirement);
        const shared = makeGuard({
          models: { entry: { model: entryV1, fields: ['slug'] } },
          payload: Schema.Struct({}),
          claims: Schema.Null,
          program: ({ db }) =>
            Effect.gen(function* () {
              const row = yield* findFirst({ db, model: db.models.entry });
              expect(row).toEqual({ id: entryRow.id, slug: entryRow.slug });
            }),
        });
        const superset = scopeContractReadDb(
          readDb,
          makeProjectedReadModels({
            entry: { model: entryV1, fields: ['folderId', 'slug'] },
          }),
        );
        yield* shared({ db: superset, payload: {}, claims: null });
        const missingField = scopeContractReadDb(
          readDb,
          makeProjectedReadModels({
            entry: { model: entryV1, fields: ['folderId'] },
          }),
        );
        expect(() =>
          Reflect.apply(shared, undefined, [
            { db: missingField, payload: {}, claims: null },
          ]),
        ).toThrow('entry.slug');
      }).pipe(Effect.scoped),
  );

  it.effect(
    'preserves encoded resources and refuses identity changes before replacing rows',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openGraph();
        expect(
          db.values(sql`PRAGMA table_info("entry")`).map(row => row[1]),
        ).toEqual([
          'id',
          'createdAt',
          'updatedAt',
          'folderId',
          'slug',
          'note',
          'details',
        ]);
        const stored = db.select().from(entryV1.drizzleSchema).get();
        if (stored === undefined) throw new Error('Expected the seeded Entry');
        expect(yield* entryV1.table.decodeRow(stored)).toEqual(entryRow);
        const decoded = db.query.entry.findFirst().sync();
        if (decoded === undefined) {
          throw new Error('Expected the decoded Entry');
        }
        const envelope = yield* encodeRowAsResource(entryV1, decoded);
        expect(envelope).toEqual({
          ...entryRow,
          details: JSON.stringify(entryRow.details),
          modelName: 'entry',
          version: 1,
        });

        const json = ' { "enabled" : true, "labels" : ["first", "雪"] } ';
        const replacement = {
          ...envelope,
          id: 'ent_replaced',
          slug: 'new',
          details: json,
        };
        const encodedRow = makeEncodedRowFromResource(replacement, entryV1);
        expect(encodedRow.details).toBe(json);
        expect(makeResourceFromEncodedRow(encodedRow, entryV1)).toEqual(
          replacement,
        );
        const folderResource = yield* encodeRowAsResource(folderV1, folderRow);
        const before = {
          folders: db.select().from(folderV1.drizzleSchema).all(),
          entries: db.select().from(entryV1.drizzleSchema).all(),
        };
        for (const invalid of [
          { ...replacement, id: 'ent_invalid', modelName: 'missing' },
          { ...replacement, id: 'ent_invalid', version: 2 },
        ]) {
          const rejected = yield* makeTx('rejectSelectedResourceIdentity')(
            function* (tx) {
              yield* applySelectedResourcesTx({
                tx,
                models: { folder: folderV1, entry: entryV1 },
                delta: {
                  upserted: [folderResource, replacement, invalid],
                  deleted: [],
                },
                replace: true,
              });
            },
          )(db).pipe(Effect.exit);
          if (Exit.isSuccess(rejected)) {
            throw new Error('Expected resource identity refusal');
          }
          expect(Cause.squash(rejected.cause)).toMatchObject({
            code: 'node-resource-model-invalid',
          });
          expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
            before.folders,
          );
          expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
            before.entries,
          );
        }
        yield* makeTx('installSelectedResources')(function* (tx) {
          yield* applySelectedResourcesTx({
            tx,
            models: { folder: folderV1, entry: entryV1 },
            delta: { upserted: [folderResource, replacement], deleted: [] },
            replace: true,
          });
        })(db);
        const installed = db.select().from(entryV1.drizzleSchema).get();
        if (installed === undefined) {
          throw new Error('Expected the replacement Entry');
        }
        expect(installed).not.toHaveProperty('modelName');
        expect(installed).not.toHaveProperty('version');
        expect(installed).toMatchObject({ details: json });
        expect(makeResourceFromEncodedRow(installed, entryV1)).toEqual(
          replacement,
        );

        const portable = {
          modelName: 'entry',
          modelVersion: 1,
          operationName: 'create' as const,
          resourceId: entryRow.id,
          body: JSON.stringify({
            attributes: yield* Schema.encodeEffect(entryV1.attributesSchema)({
              folderId: entryRow.folderId,
              slug: entryRow.slug,
              note: entryRow.note,
              details: entryRow.details,
            }),
          }),
        };
        const codec = operationCodecs(entryV1).operations.create;
        const operation = yield* Schema.decodeUnknownEffect(codec)(portable);
        expect(operation.model).toBe(entryV1);
        expect(operation.body.attributes.details).toEqual(entryRow.details);
        expect(
          (yield* prepareReplayAppliedOperation({
            operation: portable,
            controller: { models: { folder: folderV1, entry: entryV1 } },
          })).model,
        ).toBe(entryV1);
        for (const invalid of [
          { ...portable, modelName: 'missing' },
          { ...portable, modelVersion: 2 },
        ]) {
          expect(
            Exit.isFailure(
              yield* Schema.decodeUnknownEffect(codec)(invalid).pipe(
                Effect.exit,
              ),
            ),
          ).toBe(true);
          const rejected = yield* prepareReplayAppliedOperation({
            operation: invalid,
            controller: { models: { folder: folderV1, entry: entryV1 } },
          }).pipe(Effect.exit);
          if (Exit.isSuccess(rejected)) {
            throw new Error('Expected replay model identity refusal');
          }
          expect(Cause.squash(rejected.cause)).toMatchObject({
            code: 'replay-operation-model-version-unavailable',
          });
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    'validates contract reads, portable reads and complete authored selections',
    () =>
      Effect.gen(function* () {
        const { db, readDb } = yield* openGraph();
        const queryDb = makeQueryDbVersion({
          models: { folder: folderV1, entry: entryV1 },
        });
        const options = {
          where: { folder: { label: { eq: 'One' } } },
          with: { folder: true as const },
          orderBy: { slug: 'asc' as const },
        };
        expect(yield* readDb.read(entryV1, options, false)).toEqual([
          { ...entryRow, folder: folderRow },
        ]);
        const prepared = queryDb.query.entry.findMany(options).prepareRead();
        const compiled = compileReadQuery({
          models: { folder: folderV1, entry: entryV1 },
          query: prepared.request,
        });
        const rows = Schema.decodeUnknownSync(
          ReadQueryResultSchema.fields.rows,
        )(
          db._.session
            .prepareQuery(compiled.builtQuery, 'arrays', false, 'all')
            .values(),
        );
        expect(prepared.mapRows(rows)).toEqual([
          { ...entryRow, folder: folderRow },
        ]);

        const limitedEntry = makeLimitedModelVersion(
          defineModel({ name: 'entry', abbreviation: 'ent' }),
          {
            version: 1,
            attributes: { slug: entryV1.attributes.slug },
            indexes: [],
          },
        );
        const limited = makeQueryDbVersion({ models: { entry: limitedEntry } })
          .query.entry.findMany()
          .prepareRead();
        const limitedQuery = compileReadQuery({
          models: { entry: limitedEntry },
          query: limited.request,
        });
        expect(
          limited.mapRows(
            Schema.decodeUnknownSync(ReadQueryResultSchema.fields.rows)(
              db._.session
                .prepareQuery(limitedQuery.builtQuery, 'arrays', false, 'all')
                .values(),
            ),
          ),
        ).toEqual([
          { id: entryRow.id, createdAt, updatedAt, slug: entryRow.slug },
        ]);
        expect(() =>
          compileReadQuery({
            models: { entry: entryV1 },
            query: limited.request,
          }),
        ).toThrow('does not match the owner model');
        expect(() =>
          compileReadQuery({
            models: { folder: folderV1, entry: entryV1 },
            query: {
              ...prepared.request,
              models: {
                ...prepared.request.models,
                entry: {
                  modelName: entryV1.modelName,
                  version: 2,
                  columns: Object.keys(entryV1.table.shape).sort(),
                },
              },
            },
          }),
        ).toThrow('does not match the owner model');

        for (const invalid of [
          { columns: { modelName: true } },
          { with: { folder: { columns: { version: true } } } },
          { where: { version: { eq: 1 } } },
          { where: { folder: { modelName: { eq: 'folder' } } } },
          { orderBy: { modelName: 'asc' } },
          { with: { folder: { orderBy: { version: 'asc' } } } },
        ]) {
          expect(
            Exit.isFailure(
              yield* readDb.read(entryV1, invalid, false).pipe(Effect.exit),
            ),
          ).toBe(true);
          expect(() =>
            compileReadQuery({
              models: { folder: folderV1, entry: entryV1 },
              query: { ...prepared.request, config: invalid },
            }),
          ).toThrow();
        }
        for (const invalid of [
          { where: { modelName: { eq: 'entry' } } },
          { where: { folder: { version: { eq: 1 } } } },
          { orderBy: { version: 'asc' } },
        ]) {
          // Authored JavaScript can supply options without TypeScript's static rejection.
          expect(() =>
            Reflect.apply(queryDb.query.entry.findMany, queryDb.query.entry, [
              invalid,
            ]).captureOwnSource(),
          ).toThrow();
        }
        expect(() =>
          queryDb.query.entry
            .findMany({ columns: { id: true } })
            .captureOwnSource(),
        ).toThrow('complete model rows');
        const selection = queryDb.query.entry
          .findMany({
            where: options.where,
            orderBy: options.orderBy,
          })
          .captureOwnSource();
        expect(selection.all(db, {})).toEqual([
          yield* encodeRowAsResource(entryV1, entryRow),
        ]);
      }).pipe(Effect.scoped),
  );

  it.effect(
    'compiles and enforces a composite unique index with transaction rollback',
    () =>
      Effect.gen(function* () {
        const { db } = yield* openGraph();
        const index = db
          .values(sql`PRAGMA index_list("entry")`)
          .find(row => row[1] === 'entry_folder_slug_unique');
        expect(index?.[2]).toBe(1);
        expect(
          db
            .values(sql`PRAGMA index_info("entry_folder_slug_unique")`)
            .map(row => row[2]),
        ).toEqual(['folderId', 'slug']);
        const before = {
          folders: db.select().from(folderV1.drizzleSchema).all(),
          entries: db.select().from(entryV1.drizzleSchema).all(),
        };
        const duplicate = yield* makeTx('rejectDuplicateModelPair')(
          function* (tx) {
            tx.insert(folderV1.drizzleSchema)
              .values(
                yield* folderV1.table.encodeRow({
                  ...folderRow,
                  id: 'fld_rolledback',
                }),
              )
              .run();
            tx.insert(entryV1.drizzleSchema)
              .values(
                yield* entryV1.table.encodeRow({
                  ...entryRow,
                  id: 'ent_duplicate',
                }),
              )
              .run();
          },
        )(db).pipe(Effect.exit);
        if (Exit.isSuccess(duplicate)) {
          throw new Error('Expected duplicate model pair refusal');
        }
        expect(Cause.squash(duplicate.cause)).toMatchObject({
          cause: {
            code: 19,
            message: 'UNIQUE constraint failed: entry.folderId, entry.slug',
          },
        });
        expect(db.select().from(folderV1.drizzleSchema).all()).toEqual(
          before.folders,
        );
        expect(db.select().from(entryV1.drizzleSchema).all()).toEqual(
          before.entries,
        );
        yield* makeTx('retainDistinctModelPair')(function* (tx) {
          tx.insert(entryV1.drizzleSchema)
            .values(
              yield* entryV1.table.encodeRow({
                ...entryRow,
                id: 'ent_distinct',
                slug: 'second',
              }),
            )
            .run();
        })(db);
        expect(
          db.query.entry
            .findMany({ orderBy: { slug: 'asc' } })
            .sync()
            .map(row => row.slug),
        ).toEqual(['first', 'second']);
      }).pipe(Effect.scoped),
  );
});
