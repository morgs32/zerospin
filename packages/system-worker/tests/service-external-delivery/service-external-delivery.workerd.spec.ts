import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import {
  createExecutionContext,
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { getTableName, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  getServiceVersionArchive,
  getServiceVersionChain,
} from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { getServiceVersionRepo } from '../../src/ServiceVersionRepo/getServiceVersionRepo.ts';
import type { IServiceVersionRepo } from '../../src/ServiceVersionRepo/types.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';

import type {
  ExternalDeliveryControls,
  ExternalDeliveryRepo,
} from './externalDeliveryTestWorkers.ts';
import { pinnedOlderConfig, system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      EXTERNAL_DELIVERY_V1_CONTROL: Service<ExternalDeliveryControls>;
      EXTERNAL_DELIVERY_V2_CONTROL: Service<ExternalDeliveryControls>;
      EXTERNAL_DELIVERY_V1_REPO: DurableObjectNamespace<ExternalDeliveryRepo>;
      PINNED_NEWER_SERVICE_REPO: IDORepoNamespaces['SERVICE_VERSION_REPO'];
      PINNED_OLDER_SERVICE_REPO: IDORepoNamespaces['SERVICE_VERSION_REPO'];
      PINNED_OLDER_SERVICE_VERSION_CHAIN: IDORepoNamespaces['SERVICE_VERSION_CHAIN'];
      PINNED_NEWER_SERVICE_VERSION_CHAIN: IDORepoNamespaces['SERVICE_VERSION_CHAIN'];
    }
  }
}

const fixture = {
  systemId: 'sys_servicePublication',
  serviceName: 'reservations',
  serviceVersion: 1,
} as const;

const it = test.skipIf(env.EXTERNAL_DELIVERY_V1_CONTROL === undefined);

const olderControls = () => env.EXTERNAL_DELIVERY_V1_CONTROL;
const newerControls = () => env.EXTERNAL_DELIVERY_V2_CONTROL;
const resetControls = () =>
  Promise.all([
    olderControls()?.resetExternalDelivery(),
    newerControls()?.resetExternalDelivery(),
  ]);

const readProbeAttempts = async () =>
  [
    await olderControls().getProbeAttempts(),
    await newerControls().getProbeAttempts(),
  ].flat();

const getRepo = () =>
  Effect.runPromise(getServiceVersionRepo({ key: fixture }));
const getHistory = () =>
  Effect.runPromise(getServiceVersionChain({ key: fixture }));
const getRepoControl = () =>
  env.EXTERNAL_DELIVERY_V1_REPO.getByName(
    'svr_sys_servicePublication/reservations/1',
  );
const getReservationWorkRequests = () =>
  olderControls().getReservationWorkRequests();
const getReservationWorkEvaluations = () =>
  olderControls().getReservationWorkEvaluations();

async function getRepoRows(
  repo: Pick<IServiceVersionRepo, 'getRepoTableRows'>,
  tableName: string,
) {
  const { result } = await repo.getRepoTableRows({ tableName });
  if (result._tag === 'Failure') throw new Error(result.failure.code);
  return result.success.rows;
}

const getResources = (repo: Awaited<ReturnType<typeof getRepo>>) =>
  getRepoRows(repo, getTableName(reservationV1.drizzleSchema));
const getHead = (repo: Awaited<ReturnType<typeof getRepo>>) =>
  getRepoRows(repo, 'materializationHead');
const getMaterialization = async (
  repo: Awaited<ReturnType<typeof getRepo>>,
) => ({ resources: await getResources(repo), head: await getHead(repo) });

beforeEach(async () => {
  await reset();
  await resetControls();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  if (env.PINNED_OLDER_SERVICE_REPO !== undefined) {
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: makeSystemSpec({ system: pinnedOlderConfig().system }),
        })
      ).result._tag,
    ).toBe('Success');
  }
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  expect((await source.executeCommandsThrough(0)).result._tag).toBe('Success');
  await runDurableObjectAlarm(source);
  await runInDurableObject(source, (_, { storage }) => storage.deleteAlarm());
});

afterEach(async () => {
  await resetControls();
  vi.restoreAllMocks();
  await reset();
});

it('records the ordinary continuation refusal as its own outcome', async () => {
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  await runInDurableObject(source, ({ db, schema }) => {
    db.insert(schema.externalOperationOutbox)
      .values({
        externalCommandId: 'cmd_external_failure_probe',
        externalContractName: 'failingProbe',
        externalContractVersion: 1,
        serviceVersion: 1,
        originCommandId: 'cmd_external_failure_parent',
        payload: JSON.stringify({ reservationId: 'rsv_external_failure' }),
      })
      .run();
  });
  await runInDurableObject(source, instance => instance.onAlarm());
  await expect
    .poll(
      async () => (await source.getServiceCommand({ serviceIndex: 1 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        id: 'cmd_external_failure_probe',
        kind: 'system',
        commandName: 'rejectProbeObservation',
        payload: JSON.stringify({ reservationId: 'rsv_external_failure' }),
        outcome: {
          result: {
            _tag: 'Failure',
            failure: { code: 'fixture-continuation-failed' },
          },
        },
      },
    });
  await runInDurableObject(source, async instance => {
    await instance.onAlarm();
    const { db, schema } = instance;
    expect(db.select().from(schema.admissionPosition).get()?.lastIndex).toBe(1);
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
  });
});

it('recovers an invalid mapped payload without repeating its request or mapper', async () => {
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const archive = await Effect.runPromise(
    getServiceVersionArchive({ key: { ...fixture, firstServiceIndex: 1 } }),
  );
  const id = 'cmd_invalid_mapped_payload';
  const reservationId = 'rsv_invalid_mapped_payload';
  const failure = { code: 'encode-command-payload-failed' };
  await runInDurableObject(source, async (instance, state) => {
    const { db, schema } = instance;
    db.insert(schema.externalOperationOutbox)
      .values({
        externalCommandId: id,
        externalContractName: 'probeReservationWork',
        externalContractVersion: 1,
        serviceVersion: 1,
        originCommandId: 'cmd_external_parent',
        payload: JSON.stringify({
          reservationId,
          mode: 'success',
          finalizer: false,
        }),
      })
      .run();
    db.run(
      sql`CREATE TRIGGER fixture_mapper_failure BEFORE DELETE ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-mapper-failure-admission'); END`,
    );
    const background = createExecutionContext();
    const nativeWaitUntil = state.waitUntil;
    state.waitUntil = promise => {
      background.waitUntil(promise);
      nativeWaitUntil.call(state, promise);
    };
    try {
      await instance.onAlarm();
      await waitOnExecutionContext(background);
    } finally {
      state.waitUntil = nativeWaitUntil;
    }
    const pending = db.select().from(schema.externalOperationOutbox).get();
    expect(pending?.externalCommandId).toBe(id);
    expect(JSON.parse(pending?.externalOutcome ?? 'null')).toMatchObject({
      _tag: 'Success',
      success: null,
    });
    expect(JSON.parse(pending?.continuationFailure ?? 'null')).toMatchObject({
      commandName: 'completeReservationProbe',
      contractVersion: 1,
      payload: null,
      failure,
    });
    expect(db.select().from(schema.commands).all()).toEqual([]);
    expect(await readProbeAttempts()).toHaveLength(1);
    expect(await olderControls().getProbePayloadBuilds()).toEqual([
      reservationId,
    ]);
    await state.storage.deleteAlarm();
    db.run(sql`DROP TRIGGER fixture_mapper_failure`);
  });

  await evictDurableObject(source);
  await runInDurableObject(source, instance => instance.onAlarm());
  await expect
    .poll(
      async () => (await source.getServiceCommand({ serviceIndex: 1 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        id,
        commandName: 'completeReservationProbe',
        contractVersion: 1,
        serviceVersion: 1,
        payload: null,
        outcome: {
          result: { _tag: 'Failure', failure },
          finalizedAt: expect.any(Date),
        },
      },
    });
  await expect
    .poll(async () =>
      (await getRepoRows(archive, 'commands')).find(
        row => row.serviceIndex === 1,
      ),
    )
    .toMatchObject({ id, payload: null, operations: '[]' });

  await runInDurableObject(source, async instance => {
    await instance.onAlarm();
    const { db, schema } = instance;
    expect(db.select().from(schema.admissionPosition).get()?.lastIndex).toBe(1);
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
  });
  expect(await readProbeAttempts()).toHaveLength(1);
  expect(await olderControls().getProbePayloadBuilds()).toEqual([
    reservationId,
  ]);
}, 20_000);

it('settles independent requests after finalizers and retries retained observation admission after restart', async () => {
  // The release Workers' probe deadline must stay paused during finalizer coordination.
  await Promise.all([
    olderControls().holdProbeDeadlines(),
    newerControls().holdProbeDeadlines(),
  ]);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86_400_000);
  let source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const firstId = 'cmd_external_1';
  const secondId = 'cmd_external_2';
  await runInDurableObject(source, ({ db, schema }) => {
    db.insert(schema.externalOperationOutbox)
      .values(
        [1, 2].map(
          (version): typeof schema.externalOperationOutbox.$inferInsert => ({
            externalCommandId: version === 1 ? firstId : secondId,
            externalContractName: 'probeReservationWork',
            externalContractVersion: version,
            serviceVersion: version,
            originCommandId: 'cmd_external_parent',
            payload: JSON.stringify({
              reservationId: `rsv_external_${version}`,
              mode: 'success',
              finalizer: version === 1,
            }),
          }),
        ),
      )
      .run();
  });
  const frozen = await runInDurableObject(source, ({ db, schema }) =>
    db.select().from(schema.externalOperationOutbox).all(),
  );
  expect(frozen.map(row => row.serviceVersion)).toEqual([1, 2]);
  await runInDurableObject(source, async (instance, { storage }) => {
    const { db, schema } = instance;
    await instance.onAlarm();
    await expect
      .poll(
        async () =>
          (await olderControls().getProbeAttempts()).some(
            attempt =>
              attempt.payload.reservationId === 'rsv_external_1' &&
              attempt.finalizing,
          ),
        { interval: 0 },
      )
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await instance.getServiceCommand({ serviceIndex: 1 })).result,
        { interval: 0 },
      )
      .toMatchObject({
        _tag: 'Success',
        success: {
          id: secondId,
          serviceVersion: 2,
          commandName: 'completeReservationProbe',
          contractVersion: 2,
          kind: 'system',
          payload: JSON.stringify({
            reservationId: 'rsv_external_2',
            observation: 'provider 2',
            providerVersion: 2,
          }),
        },
      });
    expect(
      db
        .select()
        .from(schema.commands)
        .all()
        .some(row => row.id === firstId),
    ).toBe(false);
    db.run(sql`
      CREATE TRIGGER fixture_external_delete BEFORE DELETE ON externalOperationOutbox
      BEGIN SELECT RAISE(ABORT, 'fixture-settlement-delete'); END
    `);
    await storage.deleteAlarm();
    await olderControls().releaseProbeFinalizer('rsv_external_1');
    await expect
      .poll(
        async () =>
          (await olderControls().getProbeAttempts()).find(
            attempt => attempt.payload.reservationId === 'rsv_external_1',
          )?.finished,
        { interval: 0 },
      )
      .toBe(true);
    await expect.poll(() => storage.getAlarm(), { interval: 0 }).not.toBeNull();
    const pending = db.select().from(schema.externalOperationOutbox).all();
    expect(pending).toEqual(
      frozen
        .filter(row => row.externalCommandId === firstId)
        .map(row => ({ ...row, externalOutcome: expect.any(String) })),
    );
    db.run(sql`DROP TRIGGER fixture_external_delete`);
    await storage.deleteAlarm();
  });
  await evictDurableObject(source);
  source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  await runInDurableObject(source, async instance => {
    const { db, schema } = instance;
    // The durable observation is retried as admission; the provider request and finalizer do not run twice.
    await instance.onAlarm();
    expect(
      (await olderControls().getProbeAttempts()).filter(
        attempt => attempt.payload.reservationId === 'rsv_external_1',
      ),
    ).toHaveLength(1);
    await expect
      .poll(() => db.select().from(schema.externalOperationOutbox).all(), {
        interval: 0,
      })
      .toEqual([]);
    const completed = await Promise.all(
      [1, 2].map(async serviceIndex => {
        const result = (await instance.getServiceCommand({ serviceIndex }))
          .result;
        if (result._tag !== 'Success' || result.success === null) {
          expect.fail('Expected retained external command');
        }
        return result.success;
      }),
    );
    expect(completed.filter(command => command.id === firstId)).toMatchObject([
      {
        serviceVersion: 1,
        contractVersion: 1,
        commandName: 'completeReservationProbe',
        kind: 'system',
        payload: JSON.stringify({
          reservationId: 'rsv_external_1',
          observation: 'completed',
        }),
      },
    ]);
    const first = completed.find(command => command.id === firstId);
    expect(first).not.toHaveProperty('claims');
    expect(first).not.toHaveProperty('nodeId');
    expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([]);
  });
  expect(await readProbeAttempts()).toHaveLength(2);
}, 20_000);

it('records request, response and timeout failures only after request finalizers finish', async () => {
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  await runInDurableObject(source, ({ db, schema }) => {
    db.insert(schema.externalOperationOutbox)
      .values(
        ['failure', 'invalid-response', 'timeout'].map(
          (
            mode,
            index,
          ): typeof schema.externalOperationOutbox.$inferInsert => ({
            externalCommandId: `cmd_external_failure_${index}`,
            externalContractName: 'probeReservationWork',
            externalContractVersion: 1,
            serviceVersion: 1,
            originCommandId: 'cmd_external_parent',
            payload: JSON.stringify({
              reservationId: `rsv_external_${mode}`,
              mode,
              finalizer: mode === 'timeout',
            }),
          }),
        ),
      )
      .run();
  });
  await runInDurableObject(source, async instance => {
    const { db, schema } = instance;
    await instance.onAlarm();
    await expect
      .poll(
        async () =>
          (await olderControls().getProbeAttempts()).find(
            attempt => attempt.payload.mode === 'timeout',
          )?.finalizing,
      )
      .toBe(true);
    await expect
      .poll(() => db.select().from(schema.admissionPosition).get()?.lastIndex)
      .toBe(2);
    expect(db.select().from(schema.externalOperationOutbox).all()).toHaveLength(
      1,
    );
    const timeout = (await olderControls().getProbeAttempts()).find(
      attempt => attempt.payload.mode === 'timeout',
    );
    expect(timeout?.finished).toBe(false);
    await instance.onAlarm();
    expect(await readProbeAttempts()).toHaveLength(3);
    await olderControls().releaseProbeFinalizer('rsv_external_timeout');
    await expect
      .poll(() => db.select().from(schema.externalOperationOutbox).all())
      .toEqual([]);
    expect((await readProbeAttempts()).every(attempt => attempt.finished)).toBe(
      true,
    );
    const externalCommands = await Promise.all(
      [1, 2, 3].map(async serviceIndex => {
        const result = (await instance.getServiceCommand({ serviceIndex }))
          .result;
        if (result._tag !== 'Success' || result.success === null) {
          expect.fail('Expected retained external command');
        }
        return result.success;
      }),
    );
    expect(externalCommands).toHaveLength(3);
    for (const command of externalCommands) {
      expect(command).not.toHaveProperty('claims');
      expect(command).not.toHaveProperty('nodeId');
      expect(command).toMatchObject({
        serviceVersion: 1,
        contractVersion: 1,
        kind: 'system',
        commandName: 'completeReservationProbe',
        payload: expect.stringContaining(
          '"observation":"external-request-failed"',
        ),
      });
    }
  });
}, 20_000);

it('retains unavailable exact release, contract and payload without falling back to release 2', async () => {
  // Inspect the recovery deadline before a native alarm can consume it.
  const now = Date.now() + 86_400_000;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const original = await runInDurableObject(source, ({ db, schema }) => {
    // Keep recovery from consuming the request before the unavailable-code checks begin.
    db.insert(schema.externalOperationOutbox)
      .values({
        externalCommandId: 'cmd_external_exact',
        externalContractName: 'probeReservationWork',
        externalContractVersion: 1,
        serviceVersion: 3,
        originCommandId: 'cmd_external_parent',
        payload: JSON.stringify({
          reservationId: 'rsv_external_exact',
          mode: 'success',
          finalizer: false,
        }),
      })
      .run();
    const row = db.select().from(schema.externalOperationOutbox).get();
    if (row === undefined) throw new Error('Pending request missing');
    return { ...row, serviceVersion: 1 };
  });
  for (const change of [
    { serviceVersion: 3 },
    { externalContractVersion: 2 },
    { payload: '{}' },
  ]) {
    const pending = { ...original, ...change };
    await runInDurableObject(source, ({ db, schema }) => {
      db.update(schema.externalOperationOutbox).set(pending).run();
    });
    await runInDurableObject(source, async (instance, { storage }) => {
      await instance.onAlarm();
      expect(await storage.getAlarm()).toBe(now + 1_000);
    });
    expect(
      await runInDurableObject(source, ({ db, schema }) =>
        db.select().from(schema.externalOperationOutbox).all(),
      ),
    ).toEqual([pending]);
    expect(
      await runInDurableObject(source, ({ db, schema }) =>
        db.select().from(schema.commands).all(),
      ),
    ).toEqual([]);
    expect(await readProbeAttempts()).toEqual([]);
  }
  await runInDurableObject(source, ({ db, schema }) => {
    db.update(schema.externalOperationOutbox).set(original).run();
  });
  await runInDurableObject(source, instance => instance.onAlarm());
  await expect
    .poll(() =>
      runInDurableObject(source, ({ db, schema }) =>
        db.select().from(schema.externalOperationOutbox).all(),
      ),
    )
    .toEqual([]);
  expect(
    (await readProbeAttempts()).map(({ contractVersion, payload }) => ({
      contractVersion,
      payload,
    })),
  ).toEqual([{ contractVersion: 1, payload: JSON.parse(original.payload) }]);
}, 20_000);

const authoredReservationWork = (
  nodeId: string,
  reservationId: `rsv_${string}`,
) =>
  Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
    id: makeNodeCommandId(nodeId, 1),
    commandName: 'performReservationWork',
    contractVersion: 1,
    payload: JSON.stringify({
      reservationId,
      expiresAt: 60_000,
      mode: 'externalExtension',
    }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'actor',
    actorName: 'operator',
    actorVersion: 1,
    claims: { viewerId: 'one', department: 'billing' },
    nodeId,
    sessionName: 'operator',
    pushIndex: 1,
  });

it('recovers an authored external request across original receipt, observation admission and external command commit failures', async () => {
  let source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const repoControl = getRepoControl();
  let repo = await getRepo();
  const history = await getHistory();
  const original = authoredReservationWork(
    'node_authored_external',
    'rsv_authored_external',
  );
  const evaluationsBefore = await getReservationWorkEvaluations();
  await runInDurableObject(source, async (instance, state) => {
    const { db, schema } = instance;
    db.run(
      sql`CREATE TRIGGER fixture_original_external BEFORE INSERT ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-original-external'); END`,
    );
    const originalBackground = createExecutionContext();
    const acknowledgementFailures: unknown[] = [];
    const native = state.waitUntil;
    state.waitUntil = promise => {
      const handled = promise.catch(error => {
        expect(error).toMatchObject({ code: 'outbox-acknowledgement-failed' });
        acknowledgementFailures.push(error);
      });
      originalBackground.waitUntil(handled);
      native.call(state, handled);
    };
    try {
      expect(
        (await instance.admitServiceCommands({ commands: [original] })).result,
      ).toMatchObject({
        _tag: 'Success',
        success: [{ id: original.id, serviceIndex: 1 }],
      });
      await waitOnExecutionContext(originalBackground);
      expect(acknowledgementFailures.length).toBeGreaterThan(0);
      expect(
        db
          .select({
            serviceIndex: schema.commands.serviceIndex,
            outcome: schema.commands.outcome,
          })
          .from(schema.commands)
          .all(),
      ).toEqual([{ serviceIndex: 1, outcome: null }]);
      expect(db.select().from(schema.externalOperationOutbox).all()).toEqual(
        [],
      );
      expect(await getReservationWorkRequests()).toEqual([]);
      db.run(sql`DROP TRIGGER fixture_original_external`);
      await state.storage.deleteAlarm();
    } finally {
      state.waitUntil = native;
    }
  });
  const firstRepoActivation = await repoControl.getActivationId();
  const originalState = await getMaterialization(repo);
  expect(originalState.resources).toMatchObject([
    { id: 'rsv_authored_external', expiresAt: 60_001 },
  ]);
  expect(originalState.head).toMatchObject([{ serviceIndex: 1 }]);
  expect(await getReservationWorkEvaluations()).toBe(evaluationsBefore + 1);
  await expect
    .poll(
      async () =>
        (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
    )
    .toMatchObject({ _tag: 'Success', success: { id: original.id } });
  const retained = (await history.getEvaluatedCommand({ serviceIndex: 1 }))
    .result;
  if (retained._tag !== 'Success' || retained.success === null) {
    expect.fail('Expected the committed original output');
  }
  const evaluated = retained.success;
  expect(
    evaluated.operations.map(operation => [
      operation.operationName,
      operation.operationIndex,
    ]),
  ).toEqual([
    ['create', 0],
    ['external', 1],
    ['update', 2],
  ]);
  const external = evaluated.operations[1];
  if (external?.operationName !== 'external') {
    expect.fail('Expected the authored external operation');
  }

  // Reconstruct only the materializer while its committed head is ahead of the finalized Chain prefix.
  await evictDurableObject(repoControl);
  repo = await getRepo();
  expect(await repoControl.getActivationId()).not.toBe(firstRepoActivation);
  expect(await getMaterialization(repo)).toEqual(originalState);
  {
    using subscriber = await repoControl.executeCommandSubscriber;
    expect(
      (
        await subscriber.receive([
          { ...original, serviceIndex: 1, outcome: null },
        ])
      ).result,
    ).toEqual({ _tag: 'Success', success: [evaluated] });
  }
  expect(await getReservationWorkEvaluations()).toBe(evaluationsBefore + 1);
  expect(
    (await source.getServiceCommand({ serviceIndex: 1 })).result,
  ).toMatchObject({ _tag: 'Success', success: { outcome: null } });
  await runInDurableObject(source, async (instance, state) => {
    const { db, schema } = instance;
    const observed = createExecutionContext();
    const nativeWaitUntil = state.waitUntil;
    const nativeGetAlarm = state.storage.getAlarm;
    let failedRecoveryReads = 0;
    state.storage.getAlarm = async () => {
      if (
        (db.select().from(schema.finalizedPosition).get()?.lastIndex ?? 0) >=
          1 &&
        db.select().from(schema.externalOperationOutbox).get() !== undefined
      ) {
        failedRecoveryReads += 1;
        throw new Error('fixture-after-receipt-arm');
      }
      return nativeGetAlarm.call(state.storage);
    };
    state.waitUntil = promise => {
      const handled = promise.catch(error => {
        expect(String(error)).toContain('fixture-after-receipt-arm');
      });
      observed.waitUntil(handled);
      nativeWaitUntil.call(state, handled);
    };
    try {
      try {
        expect((await instance.executeCommandsThrough(1)).result._tag).toBe(
          'Failure',
        );
      } catch (error) {
        expect(String(error)).toContain('fixture-after-receipt-arm');
      }
      await waitOnExecutionContext(observed);
      expect(failedRecoveryReads).toBeGreaterThan(0);
      expect(db.select().from(schema.finalizedPosition).get()?.lastIndex).toBe(
        1,
      );
      expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([
        {
          externalCommandId: external.externalCommandId,
          externalContractName: 'recordReservationWork',
          externalContractVersion: 1,
          payload: JSON.stringify(external.payload),
          originCommandId: original.id,
          serviceVersion: 1,
          externalOutcome: null,
          continuationFailure: null,
        },
      ]);
      expect(await getReservationWorkRequests()).toEqual([]);
      expect(await nativeGetAlarm.call(state.storage)).not.toBeNull();
      await state.storage.deleteAlarm();
    } finally {
      state.storage.getAlarm = nativeGetAlarm;
      state.waitUntil = nativeWaitUntil;
    }
  });
  await repoControl.setObservationCommitFault(true);
  await runInDurableObject(source, async (instance, state) => {
    const { db, schema } = instance;
    const requestBackground = createExecutionContext();
    db.run(
      sql`CREATE TRIGGER fixture_authored_observation BEFORE DELETE ON externalOperationOutbox BEGIN SELECT RAISE(ABORT, 'fixture-authored-observation'); END`,
    );
    const native = state.waitUntil;
    state.waitUntil = promise => {
      requestBackground.waitUntil(promise);
      native.call(state, promise);
    };
    try {
      expect((await instance.executeCommandsThrough(1)).result._tag).toBe(
        'Success',
      );
      await waitOnExecutionContext(requestBackground);
      expect(db.select().from(schema.externalOperationOutbox).all()).toEqual([
        {
          externalCommandId: external.externalCommandId,
          externalContractName: 'recordReservationWork',
          externalContractVersion: 1,
          payload: JSON.stringify(external.payload),
          originCommandId: original.id,
          serviceVersion: 1,
          externalOutcome: expect.any(String),
          continuationFailure: null,
        },
      ]);
      expect(db.select().from(schema.admissionPosition).get()?.lastIndex).toBe(
        1,
      );
      expect(db.select().from(schema.finalizedPosition).get()?.lastIndex).toBe(
        1,
      );
      expect(await getReservationWorkRequests()).toEqual([
        'rsv_authored_external',
      ]);
      expect(await state.storage.getAlarm()).not.toBeNull();
      db.run(sql`DROP TRIGGER fixture_authored_observation`);
      await state.storage.deleteAlarm();
    } finally {
      state.waitUntil = native;
    }
  });
  expect((await source.getServiceCommand({ serviceIndex: 2 })).result).toEqual({
    _tag: 'Success',
    success: null,
  });
  await evictDurableObject(source);
  source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  await expect
    .poll(
      async () => (await source.getServiceCommand({ serviceIndex: 2 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: { id: external.externalCommandId },
    });
  await runInDurableObject(source, async instance => {
    // The actual alarm retries execution of the already admitted external command while its outer commit is faulted.
    await expect(instance.alarm()).rejects.toBeDefined();
    expect(
      instance.db.select().from(instance.schema.externalOperationOutbox).all(),
    ).toEqual([]);
  });
  const observation = (await source.getServiceCommand({ serviceIndex: 2 }))
    .result;
  if (observation._tag !== 'Success' || observation.success === null) {
    expect.fail('Expected the durably admitted observation');
  }
  expect(observation).toMatchObject({
    _tag: 'Success',
    success: {
      id: external.externalCommandId,
      commandName: 'recordReservationObservation',
      contractVersion: 1,
      payload: JSON.stringify({
        reservationId: 'rsv_authored_external',
        observation: 'Success',
      }),
      serviceName: 'reservations',
      serviceVersion: 1,
      kind: 'system',
      outcome: null,
    },
  });
  const requestsAfterObservation = (await getReservationWorkRequests()).length;
  expect(await getMaterialization(repo)).toEqual(originalState);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 2 })).result,
  ).toEqual({ _tag: 'Success', success: null });
  await repoControl.setObservationCommitFault(false);
  await evictDurableObject(repoControl);
  repo = await getRepo();
  expect((await source.executeCommandsThrough(2)).result._tag).toBe('Success');
  await expect
    .poll(
      async () =>
        (await history.getEvaluatedCommand({ serviceIndex: 2 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        id: external.externalCommandId,
        outcome: { result: { _tag: 'Success', success: 'Success' } },
      },
    });
  const completed = (await history.getEvaluatedCommand({ serviceIndex: 2 }))
    .result;
  const finalized = (await source.getServiceCommand({ serviceIndex: 2 }))
    .result;
  if (
    completed._tag !== 'Success' ||
    completed.success === null ||
    finalized._tag !== 'Success' ||
    finalized.success === null
  ) {
    expect.fail('Expected the retained external command');
  }
  expect(completed.success.payload).toBe(observation.success.payload);
  expect(completed.success.outcome).toEqual(finalized.success.outcome);
  expect(completed.success.outcome).toMatchObject({
    result: { _tag: 'Success', success: 'Success' },
    finalizedAt: expect.any(Date),
  });
  expect(await getHead(repo)).toMatchObject([{ serviceIndex: 2 }]);
  expect(await getResources(repo)).toEqual(originalState.resources);
  expect(
    (await source.admitServiceCommands({ commands: [original] })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'node-admission-index-mismatch',
      extra: { expectedPushIndex: 2 },
    },
  });
  expect((await source.executeCommandsThrough(2)).result._tag).toBe('Success');
  expect(
    await runInDurableObject(source, ({ db, schema }) => ({
      admittedThrough: db.select().from(schema.admissionPosition).get()
        ?.lastIndex,
      pending: db.select().from(schema.externalOperationOutbox).all(),
    })),
  ).toEqual({ admittedThrough: 2, pending: [] });
  expect(await getReservationWorkRequests()).toHaveLength(
    requestsAfterObservation,
  );
}, 30_000);

it('admits a successful ordinary continuation for a recorded provider failure', async () => {
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const repo = await getRepo();
  const history = await getHistory();
  const original = authoredReservationWork(
    'node_authored_failure',
    'rsv_authored_failure',
  );
  await olderControls().refuseReservationWork('rsv_authored_failure');
  await runInDurableObject(source, async (instance, state) => {
    const observed = createExecutionContext();
    const native = state.waitUntil;
    state.waitUntil = promise => {
      observed.waitUntil(promise);
      native.call(state, promise);
    };
    try {
      expect(
        (await instance.admitServiceCommands({ commands: [original] })).result
          ._tag,
      ).toBe('Success');
      expect((await instance.executeCommandsThrough(1)).result._tag).toBe(
        'Success',
      );
      await waitOnExecutionContext(observed);
    } finally {
      state.waitUntil = native;
    }
  });
  const parent = (await history.getEvaluatedCommand({ serviceIndex: 1 }))
    .result;
  if (parent._tag !== 'Success' || parent.success === null) {
    expect.fail('Expected authored output');
  }
  const external = parent.success.operations[1];
  if (external?.operationName !== 'external') {
    expect.fail('Expected an authored external operation');
  }
  const externalCommand = (await source.getServiceCommand({ serviceIndex: 2 }))
    .result;
  if (externalCommand._tag !== 'Success' || externalCommand.success === null) {
    expect.fail('Expected the admitted provider Failure');
  }
  expect(externalCommand).toMatchObject({
    _tag: 'Success',
    success: {
      id: external.externalCommandId,
      commandName: 'recordReservationObservation',
      contractVersion: 1,
      payload: JSON.stringify({
        reservationId: 'rsv_authored_failure',
        observation: 'Failure',
      }),
      serviceName: 'reservations',
      serviceVersion: 1,
      kind: 'system',
    },
  });
  const requestCount = (await getReservationWorkRequests()).length;
  expect(requestCount).toBeGreaterThan(0);
  expect((await source.executeCommandsThrough(2)).result._tag).toBe('Success');
  await expect
    .poll(
      async () =>
        (await history.getEvaluatedCommand({ serviceIndex: 2 })).result,
    )
    .toMatchObject({
      _tag: 'Success',
      success: {
        id: external.externalCommandId,
        outcome: { result: { _tag: 'Success', success: 'Failure' } },
        operations: [],
      },
    });
  const completed = (await history.getEvaluatedCommand({ serviceIndex: 2 }))
    .result;
  const finalized = (await source.getServiceCommand({ serviceIndex: 2 }))
    .result;
  if (
    completed._tag !== 'Success' ||
    completed.success === null ||
    finalized._tag !== 'Success' ||
    finalized.success === null
  ) {
    expect.fail('Expected the retained failure-handling external command');
  }
  expect(completed.success.payload).toBe(externalCommand.success.payload);
  expect(completed.success.outcome).toEqual(finalized.success.outcome);
  expect(completed.success.outcome).toMatchObject({
    result: { _tag: 'Success', success: 'Failure' },
    finalizedAt: expect.any(Date),
  });
  expect(await getMaterialization(repo)).toMatchObject({
    resources: [{ id: 'rsv_authored_failure', expiresAt: 60_001 }],
    head: [{ serviceIndex: 2 }],
  });
  expect(
    await runInDurableObject(source, ({ db, schema }) =>
      db.select().from(schema.externalOperationOutbox).all(),
    ),
  ).toEqual([]);
  expect(await getReservationWorkRequests()).toHaveLength(requestCount);
}, 20_000);

test.skipIf(env.PINNED_OLDER_SERVICE_REPO === undefined)(
  'replays source-validated continuations across independently pinned Service releases',
  async () => {
    const source = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    const older = env.PINNED_OLDER_SERVICE_REPO.getByName(
      'svr_sys_servicePublication/reservations/1',
    );
    const newer = env.PINNED_NEWER_SERVICE_REPO.getByName(
      'svr_sys_servicePublication/reservations/2',
    );
    const olderHistory = env.PINNED_OLDER_SERVICE_VERSION_CHAIN.getByName(
      'svc_sys_servicePublication/reservations/1',
    );
    const newerHistory = env.PINNED_NEWER_SERVICE_VERSION_CHAIN.getByName(
      'svc_sys_servicePublication/reservations/2',
    );
    const admitReservation = (reservationId: string, expiresAt: number) =>
      source.admitDirectSystemCommand({
        command: {
          commandName: 'createReservation',
          contractVersion: 1,
          serviceName: 'reservations',
          serviceVersion: 2,
          kind: 'system',
          payload: JSON.stringify({ reservationId, expiresAt }),
        },
      });

    expect(
      Object.keys(pinnedOlderConfig().system.services.reservations.releases),
    ).toEqual(['1']);
    await env.PINNED_PROVIDER.put('replay-source-unavailable', '');
    expect(
      (await admitReservation('rsv_pinned_original', 1)).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { serviceIndex: 1, serviceVersion: 2 },
    });
    expect(
      (await newer.awaitCommandResult({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: { serviceVersion: 2, operations: [expect.any(Object)] },
    });

    expect(
      (await older.awaitCommandResult({ serviceIndex: 1 })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-replay-adapter-source-failed' },
    });
    expect((await olderHistory.getInputCheckpoint()).result).toMatchObject({
      _tag: 'Success',
      success: { serviceIndex: 0 },
    });
    await env.PINNED_PROVIDER.delete('replay-source-unavailable');
    expect(
      (await older.awaitCommandResult({ serviceIndex: 1 })).result._tag,
    ).toBe('Success');

    for (const [
      serviceIndex,
      reservationId,
      mode,
      commandName,
      contractVersion,
    ] of [
      [2, 'rsv_pinned_adapted', 'success', 'completeReservationProbe', 2],
      [3, 'rsv_pinned_unsupported', 'failure', 'recordPinnedProbe', 1],
      [4, 'rsv_pinned_mapping_failure', 'failure', 'recordPinnedProbe', 1],
    ] as const) {
      const id = `cmd_${reservationId}` as const;
      await runInDurableObject(source, ({ db, schema }) => {
        db.insert(schema.externalOperationOutbox)
          .values({
            externalCommandId: id,
            externalContractName: 'probeReservationWork',
            externalContractVersion: 2,
            serviceVersion: 2,
            originCommandId: 'cmd_pinned_parent',
            payload: JSON.stringify({ reservationId, mode, finalizer: false }),
          })
          .run();
      });
      await runInDurableObject(source, instance => instance.onAlarm());
      await expect
        .poll(
          async () =>
            (await newerHistory.getEvaluatedCommand({ serviceIndex })).result,
        )
        .toMatchObject({
          _tag: 'Success',
          success: {
            id,
            commandName,
            contractVersion,
            serviceVersion: 2,
            payload: serviceIndex === 4 ? null : expect.any(String),
            outcome: {
              result: { _tag: serviceIndex === 4 ? 'Failure' : 'Success' },
            },
          },
        });
    }

    const readProviderCalls = async () =>
      (await env.PINNED_PROVIDER.list({ prefix: 'provider/' })).objects.map(
        item => item.key,
      );
    const providerCalls = await readProviderCalls();
    const mapperCalls = () =>
      env.PINNED_PROVIDER.list({ prefix: 'owner-reply/' });
    const committedMappers = (await mapperCalls()).objects;
    expect(providerCalls).toEqual([
      expect.stringMatching(/^provider\/rsv_pinned_adapted\/2\//),
      expect.stringMatching(/^provider\/rsv_pinned_mapping_failure\/2\//),
      expect.stringMatching(/^provider\/rsv_pinned_unsupported\/2\//),
    ]);
    expect(committedMappers).toHaveLength(3);

    for (const [serviceIndex, commandName] of [
      [5, 'recordFailedProbe'],
      [6, 'failingProbe'],
    ] as const) {
      expect(
        (
          await source.admitDirectSystemCommand({
            command: {
              commandName,
              contractVersion: 2,
              serviceName: 'reservations',
              serviceVersion: 2,
              kind: 'system',
              payload: '{}',
            },
          })
        ).result,
      ).toMatchObject({ _tag: 'Success', success: { serviceIndex } });
      expect(
        (await newer.awaitCommandResult({ serviceIndex })).result,
      ).toMatchObject({
        _tag: 'Success',
        success: { outcome: { result: { _tag: 'Success' } } },
      });
      await expect
        .poll(
          async () =>
            (await olderHistory.getEvaluatedCommand({ serviceIndex })).result,
        )
        .toMatchObject({
          _tag: 'Success',
          success: {
            commandName,
            contractVersion: 2,
            payload: '{}',
            operations: [],
            outcome: {
              result: {
                _tag: 'Failure',
                failure: { code: 'service-contract-unsupported' },
              },
            },
          },
        });
    }

    expect((await admitReservation('rsv_pinned_next', 5)).result).toMatchObject(
      {
        _tag: 'Success',
        success: { serviceIndex: 7, serviceVersion: 2 },
      },
    );
    for (const [repo, history] of [
      [older, olderHistory],
      [newer, newerHistory],
    ] as const) {
      await expect
        .poll(async () => (await history.getInputCheckpoint()).result)
        .toMatchObject({ _tag: 'Success', success: { serviceIndex: 7 } });
      expect(
        await repo.getRepoTableRows({ tableName: 'materializationHead' }),
      ).toMatchObject({
        result: { _tag: 'Success', success: { rows: [{ serviceIndex: 7 }] } },
      });
      expect(
        await repo.getRepoTableRows({
          tableName: getTableName(reservationV1.drizzleSchema),
        }),
      ).toMatchObject({
        result: {
          _tag: 'Success',
          success: {
            rows: [
              expect.objectContaining({
                id: 'rsv_pinned_original',
                expiresAt: 1,
              }),
              expect.objectContaining({ id: 'rsv_pinned_next', expiresAt: 5 }),
            ],
          },
        },
      });
    }
    expect(
      (await olderHistory.getEvaluatedCommand({ serviceIndex: 2 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: 'cmd_rsv_pinned_adapted',
        outcome: { result: { _tag: 'Success' } },
      },
    });
    expect(
      (await olderHistory.getEvaluatedCommand({ serviceIndex: 3 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: 'cmd_rsv_pinned_unsupported',
        operations: [],
        outcome: {
          result: {
            _tag: 'Failure',
            failure: { code: 'service-contract-unsupported' },
          },
        },
      },
    });
    const failure = (
      await newerHistory.getEvaluatedCommand({ serviceIndex: 4 })
    ).result;
    if (failure._tag !== 'Success' || failure.success === null) {
      expect.fail('Pinned source did not publish the construction failure');
    }
    expect(
      (await olderHistory.getEvaluatedCommand({ serviceIndex: 4 })).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        id: 'cmd_rsv_pinned_mapping_failure',
        payload: null,
        operations: [],
        outcome: {
          finalizedAt: failure.success.outcome.finalizedAt,
          result: {
            _tag: 'Failure',
            failure: { code: 'encode-command-payload-failed' },
          },
        },
      },
    });
    expect(await readProviderCalls()).toEqual(providerCalls);
    expect((await mapperCalls()).objects.map(item => item.key)).toEqual(
      committedMappers.map(item => item.key),
    );
  },
  20_000,
);
