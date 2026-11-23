import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { makeZerospinError } from '@zerospin/error';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { makeWorkerRpcEnvelope } from '../../src/runWorkerInvocation/runWorkerInvocation.ts';
import { ServiceActorVersionRepo } from '../../src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts';
import { serviceActorVersionRepoNameUtils } from '../../src/ServiceActorVersionRepo/serviceActorVersionRepoName.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import type { IServiceProjectionSubscriber } from '../../src/serviceProjection/types.ts';
import { ServiceVersionArchive } from '../../src/ServiceVersionArchive/ServiceVersionArchive.ts';
import type { IEvaluatedServiceCommand } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import type { ServiceVersionChain } from '../../src/ServiceVersionChain/ServiceVersionChain.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import config, { system } from './system.ts';

beforeEach(async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('retains history while subscribers acknowledge independently and a committed projection reply is lost', async () => {
  const key = {
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
    serviceVersion: 1,
  };
  const actor = { ...key, actorName: 'operator', actorVersion: 1 };
  let history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const slow = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(
      serviceActorVersionRepoNameUtils.makeName({
        ...actor,
        actorPath: '/slow',
      }),
    ),
  );
  const healthy = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(
      serviceActorVersionRepoNameUtils.makeName({
        ...actor,
        actorPath: '/healthy',
      }),
    ),
  );
  await runInDurableObject(slow, () => undefined);
  await runInDurableObject(healthy, () => undefined);
  const resources = makeDrizzleSchemaFromTable(reservation.table);
  let fault: 'before commit' | 'after commit' | null = 'before commit';
  const attempts: {
    actorPath: string;
    delivery: Parameters<IServiceProjectionSubscriber['receive']>[0];
  }[] = [];
  const subscribe =
    ServiceActorVersionRepo.prototype.actorVersionRepoFanoutSubscriber;
  vi.spyOn(
    ServiceActorVersionRepo.prototype,
    'actorVersionRepoFanoutSubscriber',
  ).mockImplementation(function (this: ServiceActorVersionRepo, sourceKey) {
    const subscriber = subscribe.call(this, sourceKey);
    const receive = subscriber.receive;
    const actorPath = this.key.actorPath;
    const subscriberPrototype: Pick<IServiceProjectionSubscriber, 'receive'> =
      Object.getPrototypeOf(subscriber);
    vi.spyOn(subscriberPrototype, 'receive').mockImplementation(
      async (delivery: Parameters<typeof receive>[0]) => {
        attempts.push({ actorPath, delivery });
        if (actorPath === '/slow' && fault === 'before commit') {
          throw new Error('Projection unavailable before commit');
        }
        const reply = await receive.call(subscriber, delivery);
        if (
          actorPath === '/slow' &&
          fault === 'after commit' &&
          reply.result._tag === 'Success'
        ) {
          throw new Error('Lost projection reply after durable commit');
        }
        return reply;
      },
    );
    return subscriber;
  });
  const outcome: IEvaluatedServiceCommand['outcome'] = {
    result: { _tag: 'Success', success: null },
    finalizedAt: new Date(1_000),
  };
  const command: IEvaluatedServiceCommand = {
    id: 'cmd_history_1',
    commandName: 'createReservation',
    contractVersion: 1,
    payload: '{"reservationId":"rsv_fanout","expiresAt":60000}',
    serviceName: 'reservations',
    serviceVersion: 1,
    serviceIndex: 1,
    kind: 'system',
    outcome,
    dispositionChainHash: advanceDispositionChainHash({
      previousDispositionChainHash: genesisDispositionChainHash(),
      serviceIndex: 1,
      commandId: 'cmd_history_1',
      outcome,
    }),
    operations: [
      {
        operationName: 'create',
        operationIndex: 0,
        modelName: 'reservation',
        modelVersion: 1,
        resourceId: 'rsv_fanout',
        body: '{"attributes":{"expiresAt":60000}}',
      },
    ],
  };
  expect(
    (await history.appendEvaluatedCommands({ commands: [command] })).result
      ._tag,
  ).toBe('Success');
  expect(
    Exit.isFailure(
      await runInDurableObject(history, instance =>
        config.managedRuntime.runPromise(
          instance.actorVersionRepoFanout.drain().pipe(Effect.exit),
        ),
      ),
    ),
  ).toBe(true);
  expect(
    await runInDurableObject(slow, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
    })),
  ).toEqual({ resources: [], head: [] });
  const committed = await runInDurableObject(healthy, ({ db, schema }) => ({
    resources: db.select().from(resources).all(),
    head: db.select().from(schema.materializationHead).all(),
  }));
  expect(committed.resources).toMatchObject([
    { id: 'rsv_fanout', expiresAt: 60_000 },
  ]);
  expect(committed.head).toMatchObject([{ serviceIndex: 1 }]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
        .all(),
    ),
  ).toEqual([
    {
      actorName: 'operator',
      actorPath: '/healthy',
      acknowledgedServiceIndex: 1,
    },
    { actorName: 'operator', actorPath: '/slow', acknowledgedServiceIndex: 0 },
  ]);
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);
  const retained = (await history.getEvaluatedCommand({ serviceIndex: 1 }))
    .result;
  fault = 'after commit';
  expect(
    Exit.isFailure(
      await runInDurableObject(history, instance =>
        config.managedRuntime.runPromise(
          instance.actorVersionRepoFanout.drain().pipe(Effect.exit),
        ),
      ),
    ),
  ).toBe(true);
  expect(
    await runInDurableObject(slow, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
    })),
  ).toEqual(committed);
  expect(
    await runInDurableObject(history, async ({ db, schema }, { storage }) => ({
      cursors: db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
        .all(),
      alarm: await storage.getAlarm(),
    })),
  ).toMatchObject({
    cursors: [{ acknowledgedServiceIndex: 1 }, { acknowledgedServiceIndex: 0 }],
    alarm: expect.any(Number),
  });
  const slowAttempts = attempts.filter(
    attempt => attempt.actorPath === '/slow',
  ).length;
  const healthyAttempts = attempts.filter(
    attempt => attempt.actorPath === '/healthy',
  ).length;
  await evictDurableObject(history);
  history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
        .all(),
    ),
  ).toMatchObject([
    { acknowledgedServiceIndex: 1 },
    { acknowledgedServiceIndex: 0 },
  ]);
  fault = null;
  await runDurableObjectAlarm(history);
  await expect
    .poll(() =>
      runInDurableObject(history, ({ db, schema }) =>
        db
          .select()
          .from(schema.actorVersionRepoFanoutSubscribers)
          .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
          .all(),
      ),
    )
    .toMatchObject([
      { acknowledgedServiceIndex: 1 },
      { acknowledgedServiceIndex: 1 },
    ]);
  expect(
    attempts.filter(attempt => attempt.actorPath === '/slow').length,
  ).toBeGreaterThan(slowAttempts);
  expect(
    attempts.filter(attempt => attempt.actorPath === '/healthy'),
  ).toHaveLength(healthyAttempts);
  expect(attempts.map(attempt => attempt.delivery)).toEqual(
    attempts.map(() => ({ rows: [command], lastIndex: 1 })),
  );
  expect(
    await runInDurableObject(slow, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
    })),
  ).toEqual(committed);
  expect(
    (
      await runInDurableObject(history, instance =>
        instance.actorVersionRepoFanout.subscribe({
          ...actor,
          actorPath: '/slow',
          currentIndex: 0,
        }),
      )
    ).result._tag,
  ).toBe('Success');
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
        .all(),
    ),
  ).toMatchObject([
    { acknowledgedServiceIndex: 1 },
    { acknowledgedServiceIndex: 1 },
  ]);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
  ).toEqual(retained);
  expect(
    (await history.appendEvaluatedCommands({ commands: [command] })).result
      ._tag,
  ).toBe('Success');
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: [{ ...command, payload: '{"changed":true}' }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-evaluated-command-mismatch' },
  });
  await runInDurableObject(history, instance => instance.onAlarm());
  await expect
    .poll(() =>
      runInDurableObject(history, (_, { storage }) => storage.getAlarm()),
    )
    .toBeNull();
}, 20_000);

it('bounds each drain, closes the enrollment gap and retains recovery while a producer is active', async () => {
  const key = {
    systemId: 'sys_servicePublication',
    serviceName: 'reservations',
    serviceVersion: 1,
  };
  const actor = { ...key, actorName: 'operator', actorVersion: 1 };
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const slow = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(
      serviceActorVersionRepoNameUtils.makeName({
        ...actor,
        actorPath: '/slow',
      }),
    ),
  );
  const late = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(
      serviceActorVersionRepoNameUtils.makeName({
        ...actor,
        actorPath: '/late',
      }),
    ),
  );
  await runInDurableObject(slow, () => undefined);
  const commands: IEvaluatedServiceCommand[] = [];
  let previousDispositionChainHash = genesisDispositionChainHash();
  for (let serviceIndex = 1; serviceIndex <= 67; serviceIndex++) {
    const id = `cmd_history_${serviceIndex}` as const;
    const outcome: IEvaluatedServiceCommand['outcome'] = {
      result: { _tag: 'Success', success: null },
      finalizedAt: new Date(1_000),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      serviceIndex,
      commandId: id,
      outcome,
    });
    commands.push({
      id,
      commandName: 'performReservationWork',
      contractVersion: 1,
      payload: '{"reservationId":"rsv_fanout","expiresAt":0,"mode":"noop"}',
      serviceName: 'reservations',
      serviceVersion: 1,
      serviceIndex,
      kind: 'system',
      outcome,
      dispositionChainHash,
      operations: [],
    });
    previousDispositionChainHash = dispositionChainHash;
  }
  let releaseArchive: (() => void) | undefined;
  let blockArchive = true;
  let lostArchiveReplies = 0;
  const appendArchive = ServiceVersionArchive.prototype.appendEvaluatedCommands;
  vi.spyOn(
    ServiceVersionArchive.prototype,
    'appendEvaluatedCommands',
  ).mockImplementation(async function (this: ServiceVersionArchive, props) {
    if (blockArchive && this.key.firstServiceIndex === 1) {
      await new Promise<void>(resolve => {
        releaseArchive = resolve;
      });
    }
    if (
      this.key.firstServiceIndex === 1 &&
      (props.commands.at(-1)?.serviceIndex ?? 0) >= 66
    ) {
      return config.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(
          Effect.fail(
            makeZerospinError({
              code: 'service-version-archive-full',
              extra: { lastServiceIndex: 65 },
            }),
          ),
        ),
      );
    }
    const reply = await appendArchive.call(this, props);
    if (
      this.key.firstServiceIndex === 1 &&
      props.commands.some(command => command.serviceIndex === 65) &&
      lostArchiveReplies === 0 &&
      reply.result._tag === 'Success'
    ) {
      lostArchiveReplies += 1;
      throw new Error('Lost Archive reply after command 65 committed');
    }
    return reply;
  });
  const attempts: {
    actorPath: string;
    delivery: Parameters<IServiceProjectionSubscriber['receive']>[0];
  }[] = [];
  let releaseReply: (() => void) | undefined;
  const subscribe =
    ServiceActorVersionRepo.prototype.actorVersionRepoFanoutSubscriber;
  vi.spyOn(
    ServiceActorVersionRepo.prototype,
    'actorVersionRepoFanoutSubscriber',
  ).mockImplementation(function (this: ServiceActorVersionRepo, sourceKey) {
    const subscriber = subscribe.call(this, sourceKey);
    const receive = subscriber.receive;
    const actorPath = this.key.actorPath;
    const subscriberPrototype: Pick<IServiceProjectionSubscriber, 'receive'> =
      Object.getPrototypeOf(subscriber);
    vi.spyOn(subscriberPrototype, 'receive').mockImplementation(
      async (delivery: Parameters<typeof receive>[0]) => {
        attempts.push({ actorPath, delivery });
        const reply = await receive.call(subscriber, delivery);
        if (
          actorPath === '/slow' &&
          delivery.rows.at(-1)?.serviceIndex === 64
        ) {
          await new Promise<void>(resolve => {
            releaseReply = resolve;
          });
        }
        return reply;
      },
    );
    return subscriber;
  });
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: commands.slice(0, 64),
      })
    ).result._tag,
  ).toBe('Success');
  await expect
    .poll(() => releaseReply !== undefined && releaseArchive !== undefined)
    .toBe(true);
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: commands.slice(64, 65),
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-version-archive-backlog-full' },
  });
  expect(
    (await history.appendEvaluatedCommands({ commands: commands.slice(0, 1) }))
      .result._tag,
  ).toBe('Success');
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.historyHead).all(),
    ),
  ).toMatchObject([{ serviceIndex: 64 }]);
  blockArchive = false;
  await runInDurableObject(
    env.SERVICE_VERSION_ARCHIVE.getByName(
      'sva_sys_servicePublication/reservations/1/1',
    ),
    () => releaseArchive?.(),
  );
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.archiveFanout.drain()),
  );
  expect(attempts.map(attempt => attempt.delivery.rows.length)).toEqual([64]);
  expect(
    await runInDurableObject(slow, ({ db, schema }) =>
      db.select().from(schema.materializationHead).all(),
    ),
  ).toMatchObject([{ serviceIndex: 64 }]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.actorVersionRepoFanoutSubscribers).all(),
    ),
  ).toMatchObject([{ acknowledgedServiceIndex: 0 }]);
  expect(
    (
      await runInDurableObject(history, instance =>
        instance.actorVersionRepoFanout.subscribe({
          ...actor,
          actorPath: '/slow',
          currentIndex: 64,
        }),
      )
    ).result._tag,
  ).toBe('Success');
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.actorVersionRepoFanoutSubscribers).all(),
    ),
  ).toMatchObject([{ acknowledgedServiceIndex: 64 }]);
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: commands.slice(64, 65),
      })
    ).result._tag,
  ).toBe('Success');
  await expect.poll(() => lostArchiveReplies).toBe(1);
  expect(
    (
      await history.appendEvaluatedCommands({
        commands: commands.slice(65, 66),
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(slow, () => releaseReply?.());
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.actorVersionRepoFanout.drain()),
  );
  expect(
    attempts.flatMap(attempt =>
      attempt.delivery.rows.map(row => row.serviceIndex),
    ),
  ).toEqual(Array.from({ length: 66 }, (_, index) => index + 1));
  expect(attempts[0]?.delivery.lastIndex).toBe(64);
  expect(
    attempts.slice(1).every(attempt => attempt.delivery.lastIndex === 66),
  ).toBe(true);
  expect(attempts.every(attempt => attempt.delivery.rows.length <= 64)).toBe(
    true,
  );
  expect(
    await runInDurableObject(slow, ({ db, schema }) =>
      db.select().from(schema.materializationHead).all(),
    ),
  ).toMatchObject([{ serviceIndex: 66 }]);
  let appendedDuringEnrollment = false;
  await runInDurableObject(history, instance => {
    const queue = instance.actorVersionRepoFanout;
    const enroll = queue.subscribe;
    const queuePrototype: Pick<typeof queue, 'subscribe'> =
      Object.getPrototypeOf(queue);
    vi.spyOn(queuePrototype, 'subscribe').mockImplementation(
      async (
        props: Parameters<
          ServiceVersionChain['actorVersionRepoFanout']['subscribe']
        >[0],
      ) => {
        if (props.actorPath === '/late' && !appendedDuringEnrollment) {
          appendedDuringEnrollment = true;
          expect(
            (
              await instance.appendEvaluatedCommands({
                commands: commands.slice(66),
              })
            ).result._tag,
          ).toBe('Success');
        }
        return enroll.call(queue, props);
      },
    );
  });
  await runInDurableObject(late, () => undefined);
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.actorVersionRepoFanout.drain()),
  );
  expect(appendedDuringEnrollment).toBe(true);
  expect(
    await runInDurableObject(late, ({ db, schema }) =>
      db.select().from(schema.materializationHead).all(),
    ),
  ).toMatchObject([{ serviceIndex: 67 }]);
  expect(
    attempts
      .filter(attempt => attempt.actorPath === '/late')
      .map(attempt => attempt.delivery),
  ).toEqual([{ rows: commands.slice(66), lastIndex: 67 }]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(schema.actorVersionRepoFanoutSubscribers.actorPath)
        .all(),
    ),
  ).toMatchObject([
    { actorPath: '/late', acknowledgedServiceIndex: 67 },
    { actorPath: '/slow', acknowledgedServiceIndex: 67 },
  ]);
  await runInDurableObject(history, instance =>
    config.managedRuntime.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.commands).all(),
    ),
  ).toEqual([]);
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.archives).all(),
    ),
  ).toEqual([{ firstServiceIndex: 1 }, { firstServiceIndex: 66 }]);
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 65 })).result,
  ).toEqual({ _tag: 'Success', success: commands[64] });
  expect(
    (await history.getEvaluatedCommand({ serviceIndex: 66 })).result,
  ).toEqual({ _tag: 'Success', success: commands[65] });
  await evictDurableObject(history);
  expect((await history.getInputCheckpoint()).result).toEqual({
    _tag: 'Success',
    success: {
      serviceIndex: 67,
      id: commands[66]!.id,
      dispositionChainHash: commands[66]!.dispositionChainHash,
    },
  });
  await runInDurableObject(history, async (instance, { storage }) => {
    await config.managedRuntime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* instance.actorVersionRepoFanout.producerLease;
          yield* Effect.promise(() => instance.onAlarm());
          expect(
            yield* Effect.promise(() => storage.getAlarm()),
          ).not.toBeNull();
        }),
      ),
    );
    expect(await storage.getAlarm()).not.toBeNull();
    await instance.onAlarm();
    expect(await storage.getAlarm()).toBeNull();
  });
}, 20_000);
