import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { IServiceVersionRepoInstance } from '@zerospin/owner-release-worker/VersionRepos';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { afterEach, expect, it, vi } from 'vitest';

import { getNativeSystemApi } from '../../src/getNativeSystemApi/getNativeSystemApi.ts';
import { admitFromServiceChainTx } from '../../src/ServiceChain/admitRecordedServiceCommandTx.ts';
import { ServiceVersionArchive } from '../../src/ServiceVersionArchive/ServiceVersionArchive.ts';
import { ServiceVersionChain } from '../../src/ServiceVersionChain/ServiceVersionChain.ts';
import { getServiceVersionRepo } from '../../src/ServiceVersionRepo/getServiceVersionRepo.ts';
import {
  configureServingSystemSpec,
  listPinnedOwnerReleases,
  readServingSystemSpec,
} from '../../src/workerConfiguration/workerConfiguration.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import {
  reservationEvaluations,
  resetReservationEvaluations,
} from './createReservationV1.ts';
import config, { pinnedOlderConfig, system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      CUTOVER_SERVICE_VERSION_REPO: DurableObjectNamespace<IServiceVersionRepoInstance>;
      PINNED_NEWER_SERVICE_REPO: DurableObjectNamespace<IServiceVersionRepoInstance>;
    }
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  resetReservationEvaluations();
  await reset();
});

it('retries a lost publication reply after ServiceVersionRepo eviction without evaluating again', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');

  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const repo = env.SERVICE_VERSION_REPO.getByName(
    'svr_sys_servicePublication/reservations/1',
  );
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const resources = makeDrizzleSchemaFromTable(reservation.table);
  let lostReplies = 0;

  const append = ServiceVersionChain.prototype.appendEvaluatedCommands;
  const publication = vi
    .spyOn(ServiceVersionChain.prototype, 'appendEvaluatedCommands')
    .mockImplementation(async function (this: ServiceVersionChain, props) {
      const reply = await append.call(this, props);
      if (reply.result._tag === 'Success') {
        lostReplies += 1;
        throw new Error('Lost publication reply after durable commit');
      }
      return reply;
    });

  let archiveFault: 'before commit' | 'after commit' | null = 'before commit';
  let lostArchiveReplies = 0;
  const appendArchive = ServiceVersionArchive.prototype.appendEvaluatedCommands;
  vi.spyOn(
    ServiceVersionArchive.prototype,
    'appendEvaluatedCommands',
  ).mockImplementation(async function (this: ServiceVersionArchive, props) {
    if (this.key.serviceVersion !== 1) return appendArchive.call(this, props);
    if (archiveFault === 'before commit') {
      throw new Error('Archive unavailable');
    }
    const reply = await appendArchive.call(this, props);
    if (archiveFault === 'after commit' && reply.result._tag === 'Success') {
      lostArchiveReplies += 1;
      throw new Error('Lost Archive reply after durable commit');
    }
    return reply;
  });

  const evaluationsBefore = reservationEvaluations;
  const command = {
    id: 'cmd_publication',
    commandName: 'createReservation',
    contractVersion: 1,
    payload: JSON.stringify({ reservationId: 'rsv_one', expiresAt: 60_000 }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'system',
  } as const;
  expect(
    (
      await source.admitFromServiceChain({
        source: {
          systemId: 'sys_servicePublication',
          serviceName: 'reservations',
        },
        position: { sourceIndex: 1, operationIndex: 0 },
        command,
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result).toMatchObject({
    _tag: 'Success',
  });
  await expect.poll(() => lostReplies).toBeGreaterThan(0);

  const pending = await runInDurableObject(repo, ({ db, schema }) => ({
    resources: db.select().from(resources).all(),
    head: db.select().from(schema.materializationHead).all(),
    outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
  }));
  expect(pending.resources).toMatchObject([
    { id: 'rsv_one', expiresAt: 60_000 },
  ]);
  expect(pending.head).toMatchObject([{ serviceIndex: 1 }]);
  expect(pending.outbox).toMatchObject([
    { id: 'cmd_publication', serviceIndex: 1, serviceVersion: 1 },
  ]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual(pending.outbox);
  // The counter belongs to the original release program.
  await expect.poll(() => reservationEvaluations).toBe(evaluationsBefore + 1);
  const evaluations = reservationEvaluations;
  const retainedCommand = (
    await history.getEvaluatedCommand({ serviceIndex: 1 })
  ).result;

  // A selected release's activation must publish pending output before it can report replay progress.
  // Restore transport before opening the new activation; the pending row survives eviction.
  publication.mockRestore();
  await evictDurableObject(repo);
  await runDurableObjectAlarm(repo);
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) => ({
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.serviceVersionChainOutbox).all(),
      })),
    )
    .toEqual({ ...pending, outbox: [] });
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual(pending.outbox);
  expect(reservationEvaluations).toBe(evaluations);
  const systemApi = getNativeSystemApi('sys_servicePublication');
  const readRootTable = (tableName: 'canonicalHistory' | 'commands') =>
    Effect.runPromise(
      systemApi.getRepoTableRows({
        repoType: 'ServiceChain',
        repoName: 'sc_sys_servicePublication/reservations',
        tableName,
      }),
    );
  await expect
    .poll(async () => {
      await source.onAlarm();
      const [history, commands] = await Promise.all([
        readRootTable('canonicalHistory'),
        readRootTable('commands'),
      ]);
      return { history: history.rows[0], commands: commands.rows };
    })
    .toMatchObject({
      history: { serviceVersion: 1, serviceIndex: 1 },
      commands: [],
    });
  // ServiceVersionChain local commit already owns replay while physical Archive delivery is unavailable.
  expect(
    (await source.getServiceCommand({ serviceIndex: 1 })).result,
  ).toMatchObject({
    _tag: 'Success',
    success: { id: command.id, serviceIndex: 1 },
  });

  archiveFault = 'after commit';
  expect(
    Exit.isFailure(
      await runInDurableObject(history, instance =>
        config.managedRuntime.runPromise(
          instance.archiveFanout.drain().pipe(Effect.exit),
        ),
      ),
    ),
  ).toBe(true);
  expect(lostArchiveReplies).toBeGreaterThan(0);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.archiveFanoutSubscribers).all(),
    ),
  ).toMatchObject([{ acknowledgedServiceIndex: 0 }]);
  archiveFault = null;
  await evictDurableObject(history);
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual(retainedCommand);
  expect(reservationEvaluations).toBe(evaluations);
}, 20_000);

function setServingSpec(spec: ReturnType<typeof makeSystemSpec>) {
  env.ZEROSPIN_SYSTEM_SPEC_HASH = spec.hash;
  configureServingSystemSpec(
    JSON.stringify({ spec, ownerReleases: listPinnedOwnerReleases() }),
  );
}

it('switches a fixed canonical prefix through publication-safe enrollment while the local suffix is full', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const currentSpec = readServingSystemSpec();
  if (currentSpec === undefined) expect.fail('Expected a serving SystemSpec');
  const parallel = await Effect.runPromise(
    getServiceVersionRepo({
      key: {
        systemId: 'sys_servicePublication',
        serviceName: 'reservations',
        serviceVersion: 2,
      },
    }),
  );
  await env.PINNED_PROVIDER.put('pause-service-publication', '');
  const producer = {
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
  };
  const command = {
    id: 'cmd_cutover_1',
    commandName: 'createReservation',
    contractVersion: 1,
    payload: JSON.stringify({
      reservationId: 'rsv_cutover_1',
      expiresAt: 60_000,
    }),
    serviceName: 'reservations',
    serviceVersion: 1,
    kind: 'system',
  } as const;
  expect(
    (
      await source.admitFromServiceChain({
        source: producer,
        position: { sourceIndex: 1, operationIndex: 0 },
        command,
      })
    ).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result).toMatchObject({
    _tag: 'Success',
  });
  await runInDurableObject(source, instance =>
    config.managedRuntime.runPromise(instance.replayCommandsFanout.drain()),
  );
  await expect
    .poll(async () => {
      await runDurableObjectAlarm(source);
      return runInDurableObject(source, ({ db, schema }) =>
        db.select().from(schema.canonicalHistory).get(),
      );
    })
    .toMatchObject({ serviceVersion: 1, serviceIndex: 1 });
  const original = (await source.getServiceCommand({ serviceIndex: 1 })).result;
  expect(original).toMatchObject({
    _tag: 'Success',
    success: { outcome: { result: { _tag: 'Success', success: null } } },
  });
  expect(
    await parallel.getRepoTableRows({ tableName: 'materializationHead' }),
  ).toMatchObject({
    result: { _tag: 'Success', success: { rows: [{ serviceIndex: 1 }] } },
  });
  expect(
    await parallel.getRepoTableRows({ tableName: 'serviceVersionChainOutbox' }),
  ).toMatchObject({
    result: { _tag: 'Success', success: { rows: [{ serviceIndex: 1 }] } },
  });
  await runInDurableObject(source, async ({ db, key }) => {
    for (let index = 2; index <= 65; index += 1) {
      await config.managedRuntime.runPromise(
        admitFromServiceChainTx(db, {
          key,
          source: producer,
          position: { sourceIndex: index, operationIndex: 0 },
          command: {
            ...command,
            id: `cmd_cutover_${index}`,
            payload: JSON.stringify({
              reservationId: `rsv_cutover_${index}`,
              expiresAt: 60_000,
            }),
          },
        }),
      );
    }
  });
  await env.PINNED_PROVIDER.put('pause-service-originals', '');
  const selected = makeSystem({
    ...system,
    services: {
      reservations: { ...system.services.reservations, canonical: 2 },
    },
  });
  const selectedSpec = makeSystemSpec({ system: selected });
  try {
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: selectedSpec,
        })
      ).result._tag,
    ).toBe('Success');
    setServingSpec(selectedSpec);
    await evictDurableObject(source);
    await runInDurableObject(source, instance =>
      instance.onAlarm().catch(() => undefined),
    );
    expect(
      await runInDurableObject(source, ({ db, schema }) => ({
        adopted: db.select().from(schema.canonicalHistory).get(),
        count: db.select().from(schema.commands).all().length,
      })),
    ).toMatchObject({
      adopted: { serviceVersion: 1, serviceIndex: 1 },
      count: 64,
    });
    expect(
      (
        await source.admitFromServiceChain({
          source: producer,
          position: { sourceIndex: 66, operationIndex: 0 },
          command: { ...command, id: 'cmd_refused' },
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-admission-backlog-full' },
    });
    await env.PINNED_PROVIDER.delete('pause-service-publication');
    await env.CUTOVER_SERVICE_VERSION_REPO.getByName(
      'svr_sys_servicePublication/reservations/2',
    ).onAlarm();
    await expect
      .poll(async () => {
        await runInDurableObject(source, instance =>
          instance.onAlarm().catch(() => undefined),
        );
        return runInDurableObject(source, ({ db, schema }) => ({
          adopted: db.select().from(schema.canonicalHistory).get(),
          count: db.select().from(schema.commands).all().length,
        }));
      })
      .toMatchObject({
        adopted: { serviceVersion: 2, serviceIndex: 1 },
        count: 64,
      });
    const adopted = (await source.getServiceCommand({ serviceIndex: 1 }))
      .result;
    if (
      original._tag !== 'Success' ||
      original.success === null ||
      adopted._tag !== 'Success' ||
      adopted.success === null
    ) {
      expect.fail('Expected complete original and adopted commands');
    }
    expect(adopted.success).toEqual({
      ...original.success,
      outcome: {
        ...original.success.outcome,
        result: { _tag: 'Success', success: 'canonical' },
      },
    });
    // Let release 2 pull the new V1 commands before resuming automatic fanout.
    await runInDurableObject(source, ({ db, schema }) => {
      db.delete(schema.replaySubscribers)
        .where(eq(schema.replaySubscribers.serviceVersion, 2))
        .run();
    });
    using replay = await parallel.replayCommandsFanoutSubscriber(producer);
    await env.PINNED_PROVIDER.delete('pause-service-originals');
    expect((await source.executeCommandsThrough(65)).result._tag).toBe(
      'Success',
    );
    const replayed = await replay.subscribe(3);
    expect(replayed.result._tag).toBe('Success');
    const { spans } = replayed.telemetry;
    expect(
      spans.filter(span => span.name === 'FanoutQueue.getPage'),
    ).toHaveLength(1);
    expect(
      spans.filter(
        span => span.name === 'ServiceVersionRepo.evaluateServiceCommand',
      ),
    ).toHaveLength(2);
    await expect
      .poll(
        async () => {
          await runInDurableObject(source, instance =>
            instance.onAlarm().catch(() => undefined),
          );
          return runInDurableObject(
            source,
            ({ db, schema }) =>
              db.select().from(schema.canonicalHistory).get()?.serviceIndex,
          );
        },
        { timeout: 10_000 },
      )
      .toBe(65);
    const outcome = await Effect.runPromise(
      getNativeSystemApi('sys_servicePublication').executeServiceCommand(
        system.services.reservations.releases[1],
        {
          contractName: 'createReservation',
          payload: { reservationId: 'rsv_own_result', expiresAt: 60_000 },
        },
      ),
    );
    expect(outcome).toMatchObject({
      result: { _tag: 'Success', success: null },
    });
    await expect
      .poll(async () => {
        await runDurableObjectAlarm(source);
        return (await source.getServiceCommand({ serviceIndex: 66 })).result;
      })
      .toMatchObject({
        _tag: 'Success',
        success: {
          outcome: { result: { _tag: 'Success', success: 'canonical' } },
        },
      });
  } finally {
    setServingSpec(currentSpec);
    await env.PINNED_PROVIDER.delete('pause-service-originals');
    await env.PINNED_PROVIDER.delete('pause-service-publication');
  }
}, 30_000);

it.skipIf(!('PINNED_NEWER_SERVICE_REPO' in env))(
  'waits for the pinned ServiceVersionChain when only the stable canonical selection changes',
  async () => {
    const systemId = 'sys_servicePublication';
    const path = `${systemId}/reservations`;
    const systemRepo = env.SYSTEM_REPO.getByName(systemId);
    const currentSpec = readServingSystemSpec();
    if (currentSpec === undefined) expect.fail('Expected a serving SystemSpec');
    const source = env.SERVICE_CHAIN.getByName(`sc_${path}`);
    const newer = env.PINNED_NEWER_SERVICE_REPO.getByName(`svr_${path}/2`);
    const newerHistory = env.PINNED_NEWER_SERVICE_VERSION_CHAIN.getByName(
      `svc_${path}/2`,
    );
    await env.PINNED_PROVIDER.put('pause-service-publication', '');

    const accept = async (
      selected: Parameters<typeof makeSystemSpec>[0]['system'],
    ) => {
      const spec = makeSystemSpec({ system: selected });
      expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
        'Success',
      );
      return spec;
    };
    const finalize = async (serviceIndex: number) => {
      expect(
        (
          await source.admitFromServiceChain({
            source: { systemId, serviceName: 'reservations' },
            position: { sourceIndex: serviceIndex, operationIndex: 0 },
            command: {
              id: `cmd_pinned_cutover_${serviceIndex}`,
              commandName: 'createReservation',
              contractVersion: 1,
              payload: JSON.stringify({
                reservationId: `rsv_pinned_cutover_${serviceIndex}`,
                expiresAt: 60_000,
              }),
              serviceName: 'reservations',
              serviceVersion: 1,
              kind: 'system',
            },
          })
        ).result._tag,
      ).toBe('Success');
      expect(
        (await source.executeCommandsThrough(serviceIndex)).result._tag,
      ).toBe('Success');
    };
    const readAdoption = () =>
      runInDurableObject(source, ({ db, schema }) => ({
        prefix: db.select().from(schema.canonicalHistory).get(),
        suffix: db
          .select()
          .from(schema.commands)
          .all()
          .map(row => row.serviceIndex),
      }));
    const recoverAdoption = async () => {
      await runDurableObjectAlarm(source);
      return readAdoption();
    };

    try {
      await accept(pinnedOlderConfig().system);
      await accept(system);
      expect((await systemRepo.initialize()).result._tag).toBe('Success');
      await finalize(1);
      await expect.poll(recoverAdoption).toMatchObject({
        prefix: { serviceVersion: 1, serviceIndex: 1 },
        suffix: [],
      });

      const selected = makeSystem({
        ...system,
        services: {
          reservations: { ...system.services.reservations, canonical: 2 },
        },
      });
      setServingSpec(await accept(selected));
      await evictDurableObject(source);
      await finalize(2);
      await runInDurableObject(source, instance =>
        config.managedRuntime.runPromise(instance.replayCommandsFanout.drain()),
      );
      expect(
        await newer.getRepoTableRows({ tableName: 'materializationHead' }),
      ).toMatchObject({
        result: {
          _tag: 'Success',
          success: { rows: [{ serviceIndex: 2 }] },
        },
      });
      expect(
        (
          await newerHistory.getEvaluatedCommandPage({
            afterIndex: 0,
            maxIndex: 0,
          })
        ).result,
      ).toMatchObject({ _tag: 'Success', success: { lastIndex: 0 } });
      expect(await recoverAdoption()).toMatchObject({
        prefix: { serviceVersion: 1, serviceIndex: 1 },
        suffix: [2],
      });
      expect(
        (await source.getServiceCommand({ serviceIndex: 1 })).result,
      ).toMatchObject({
        _tag: 'Success',
        success: { outcome: { result: { _tag: 'Success', success: null } } },
      });

      await env.PINNED_PROVIDER.delete('pause-service-publication');
      await newer.onAlarm();
      await expect.poll(recoverAdoption).toMatchObject({
        prefix: { serviceVersion: 2, serviceIndex: 2 },
        suffix: [],
      });
      expect(
        (await source.getServiceCommand({ serviceIndex: 1 })).result,
      ).toMatchObject({
        _tag: 'Success',
        success: {
          outcome: { result: { _tag: 'Success', success: 'canonical' } },
        },
      });
    } finally {
      setServingSpec(currentSpec);
    }
  },
  20_000,
);
