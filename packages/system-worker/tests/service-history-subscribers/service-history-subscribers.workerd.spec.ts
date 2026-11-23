import { ActorCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { ServiceActorVersionRepo } from '../../src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts';
import { serviceActorVersionRepoNameUtils } from '../../src/ServiceActorVersionRepo/serviceActorVersionRepoName.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import { resolveServiceActorView } from '../../src/serviceProjection/resolveServiceActorView.ts';
import { EvaluatedServiceCommandSchema } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import { requireAuthoredWorkerConfig } from '../../src/workerConfiguration/workerConfiguration.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { system } from './system.ts';

const sourceKey = {
  systemId: 'sys_servicePublication',
  serviceName: 'reservations',
  serviceVersion: 1,
};
const actorKey = {
  ...sourceKey,
  actorName: 'operator',
  actorVersion: 1,
  actorPath: '/one',
};
const outcome = {
  result: { _tag: 'Success', success: null },
  finalizedAt: new Date('2026-10-22T12:00:00Z'),
} as const;
const command = Schema.decodeUnknownSync(
  Schema.toType(EvaluatedServiceCommandSchema),
)({
  id: 'cmd_actor_binding',
  serviceIndex: 1,
  serviceName: 'reservations',
  serviceVersion: 1,
  commandName: 'createReservation',
  contractVersion: 1,
  payload: JSON.stringify({
    reservationId: 'rsv_actor_binding',
    expiresAt: 60_000,
  }),
  kind: 'actor',
  actorName: 'operator',
  actorVersion: 1,
  claims: { viewerId: 'one', department: 'billing' },
  nodeId: 'node_actor_binding',
  sessionName: 'operator',
  pushIndex: 1,
  outcome,
  dispositionChainHash: advanceDispositionChainHash({
    previousDispositionChainHash: genesisDispositionChainHash(),
    serviceIndex: 1,
    commandId: 'cmd_actor_binding',
    outcome,
  }),
  operations: [
    {
      operationName: 'create',
      operationIndex: 0,
      modelName: 'reservation',
      modelVersion: 1,
      resourceId: 'rsv_actor_binding',
      body: JSON.stringify({ attributes: { expiresAt: 60_000 } }),
    },
  ],
});
const resources = makeDrizzleSchemaFromTable(reservation.table);
const parallelKey = { ...actorKey, serviceVersion: 2, actorVersion: 2 };
const expectedResources = [
  {
    id: 'rsv_actor_binding',
    expiresAt: 60_000,
    createdAt: outcome.finalizedAt,
    updatedAt: outcome.finalizedAt,
  },
];

beforeEach(async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  vi.spyOn(
    ServiceActorVersionChain.prototype,
    'appendExposedCommands',
  ).mockRejectedValue(new Error('Selected publication unavailable'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('keeps Actor names, paths and release versions in separate resource views with private resolutions only for their owner', async () => {
  if (!Schema.is(ActorCommandSchema)(command)) {
    expect.fail('Expected the concrete Node Actor command');
  }
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  expect(
    (await history.appendEvaluatedCommands({ commands: [command] })).result
      ._tag,
  ).toBe('Success');
  const memberships = [
    { actorName: 'operator', actorVersion: 1, actorPath: '/one' },
    { actorName: 'operator', actorVersion: 1, actorPath: '/two' },
    { actorName: 'auditor', actorVersion: 1, actorPath: '/one' },
  ];
  using fanout = await history.actorVersionRepoFanout;
  for (const membership of memberships) {
    expect(
      (
        await fanout.subscribe({
          ...sourceKey,
          ...membership,
          currentIndex: 0,
        })
      ).result._tag,
    ).toBe('Success');
  }
  await runInDurableObject(history, instance =>
    requireAuthoredWorkerConfig().managedRuntime.runPromise(
      instance.actorVersionRepoFanout.drain(),
    ),
  );
  const subscribers = await runInDurableObject(history, ({ db, schema }) =>
    db
      .select()
      .from(schema.actorVersionRepoFanoutSubscribers)
      .orderBy(
        schema.actorVersionRepoFanoutSubscribers.actorName,
        schema.actorVersionRepoFanoutSubscribers.actorPath,
      )
      .all(),
  );
  expect(subscribers).toEqual([
    { actorName: 'auditor', actorPath: '/one', acknowledgedServiceIndex: 1 },
    { actorName: 'operator', actorPath: '/one', acknowledgedServiceIndex: 1 },
    { actorName: 'operator', actorPath: '/two', acknowledgedServiceIndex: 1 },
  ]);
  if (command.kind !== 'actor') expect.fail('Expected the Actor command');
  const names = new Set<string>();
  for (const membership of memberships) {
    const key = { ...sourceKey, ...membership };
    const name = Effect.runSync(serviceActorVersionRepoNameUtils.makeName(key));
    names.add(name);
    const actor = env.SERVICE_ACTOR_VERSION_REPO.getByName(name);
    const projected = await runInDurableObject(
      actor,
      ({ db, schema, key }) => ({
        key,
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.exposedCommandOutbox).all(),
      }),
    );
    expect(projected.key).toEqual(key);
    expect(projected.resources).toEqual(expectedResources);
    expect(projected.head).toMatchObject([{ serviceIndex: 1 }]);
    expect(projected.outbox).toHaveLength(1);
    expect(
      JSON.parse(projected.outbox[0]?.commandResolution ?? 'null'),
    ).toEqual(
      membership.actorName === 'operator' && membership.actorPath === '/one'
        ? {
            nodeId: command.nodeId,
            sessionName: command.sessionName,
            pushIndex: command.pushIndex,
            claims: { viewerId: 'one', department: 'billing' },
            failure: null,
          }
        : null,
    );
  }

  names.add(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(parallelKey)),
  );
  expect(names.size).toBe(4);
  expect(
    (await fanout.subscribe({ ...actorKey, currentIndex: 0 })).result._tag,
  ).toBe('Success');
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .orderBy(
          schema.actorVersionRepoFanoutSubscribers.actorName,
          schema.actorVersionRepoFanoutSubscribers.actorPath,
        )
        .all(),
    ),
  ).toEqual(subscribers);
});

it('materializes a separate release view without the prior Actor private resolution', async () => {
  const parallelHistory = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/2',
  );
  expect(
    (await parallelHistory.appendEvaluatedCommands({ commands: [command] }))
      .result._tag,
  ).toBe('Success');
  const parallelName = Effect.runSync(
    serviceActorVersionRepoNameUtils.makeName(parallelKey),
  );
  const parallelActor = env.SERVICE_ACTOR_VERSION_REPO.getByName(parallelName);
  expect((await parallelActor.awaitStartup()).result._tag).toBe('Success');
  expect(
    await runInDurableObject(parallelActor, ({ db, schema, key }) => ({
      key,
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.exposedCommandOutbox).all(),
    })),
  ).toMatchObject({
    key: parallelKey,
    resources: expectedResources,
    head: [{ serviceIndex: 1 }],
    outbox: [{ commandResolution: null }],
  });
});

it('rejects invalid enrollment and receiver keys before changing membership or materialization', async () => {
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  expect(
    (await history.appendEvaluatedCommands({ commands: [command] })).result
      ._tag,
  ).toBe('Success');
  const actor = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(actorKey)),
  );
  expect((await actor.awaitStartup()).result._tag).toBe('Success');
  const before = await runInDurableObject(history, ({ db, schema }) =>
    db.select().from(schema.actorVersionRepoFanoutSubscribers).all(),
  );
  const projection = await runInDurableObject(actor, ({ db, schema }) => ({
    resources: db.select().from(resources).all(),
    head: db.select().from(schema.materializationHead).all(),
    outbox: db.select().from(schema.exposedCommandOutbox).all(),
  }));
  using fanout = await history.actorVersionRepoFanout;
  for (const { change, code } of [
    { change: { actorVersion: 2 }, code: 'actor-version-unsupported' },
    {
      change: { systemId: 'sys_other' },
      code: 'fanout-subscriber-owner-mismatch',
    },
    { change: { actorVersion: 0 }, code: 'repo-key-encode-failed' },
    { change: { currentIndex: 2 }, code: 'fanout-subscriber-index-invalid' },
  ]) {
    expect(
      (await fanout.subscribe({ ...actorKey, currentIndex: 1, ...change }))
        .result,
    ).toMatchObject({ _tag: 'Failure', failure: { code } });
  }
  await runInDurableObject(actor, async instance => {
    expect(() =>
      instance.actorVersionRepoFanoutSubscriber({
        ...sourceKey,
        serviceVersion: 2,
      }),
    ).toThrow('Service source does not match the bound service projection');
    expect(
      await requireAuthoredWorkerConfig().managedRuntime.runPromise(
        resolveServiceActorView(system.services.reservations.releases[1], {
          ...actorKey,
          actorPath: 'one',
        }).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'actor-path-noncanonical' });
  });
  expect(
    await runInDurableObject(history, ({ db, schema }) =>
      db.select().from(schema.actorVersionRepoFanoutSubscribers).all(),
    ),
  ).toEqual(before);
  expect(
    await runInDurableObject(actor, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.exposedCommandOutbox).all(),
    })),
  ).toEqual(projection);
});

it('retains the original subscriber and checkpoint while receiving code or definitions are unavailable, then retries after eviction', async () => {
  const history = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  const actor = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(actorKey)),
  );
  expect((await actor.awaitStartup()).result._tag).toBe('Success');
  const receive =
    ServiceActorVersionRepo.prototype.actorVersionRepoFanoutSubscriber;
  const unavailable = vi
    .spyOn(
      ServiceActorVersionRepo.prototype,
      'actorVersionRepoFanoutSubscriber',
    )
    .mockImplementation(function (this: ServiceActorVersionRepo, key) {
      if (this.key.serviceVersion === 1) {
        throw new Error('Actor receiving code unavailable before commit');
      }
      return receive.call(this, key);
    });
  expect(
    (await history.appendEvaluatedCommands({ commands: [command] })).result
      ._tag,
  ).toBe('Success');
  await expect(
    runInDurableObject(history, instance =>
      requireAuthoredWorkerConfig().managedRuntime.runPromise(
        instance.actorVersionRepoFanout.drain(),
      ),
    ),
  ).rejects.toThrow('Actor receiving code unavailable before commit');
  const retained = await runInDurableObject(history, ({ db, schema }) => ({
    commands: db.select().from(schema.commands).all(),
    subscribers: db
      .select()
      .from(schema.actorVersionRepoFanoutSubscribers)
      .all(),
  }));
  expect(retained.subscribers).toEqual([
    { actorName: 'operator', actorPath: '/one', acknowledgedServiceIndex: 0 },
  ]);
  expect(
    await runInDurableObject(actor, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
    })),
  ).toEqual({ resources: [], head: [] });

  for (const absent of ['actor', 'release'] as const) {
    const config = requireAuthoredWorkerConfig();
    const originalSystem = config.system;
    Object.defineProperty(config, 'system', {
      value: {
        ...system,
        services: {
          ...system.services,
          reservations:
            absent === 'release'
              ? {
                  releases: { 2: system.services.reservations.releases[2] },
                  canonical: 2,
                }
              : {
                  ...originalSystem.services.reservations,
                  releases: {
                    ...originalSystem.services.reservations?.releases,
                    1: {
                      ...system.services.reservations.releases[1],
                      actors: {},
                    },
                  },
                },
        },
      },
    });
    try {
      await evictDurableObject(history);
      const code =
        absent === 'actor'
          ? 'actor-version-unsupported'
          : 'service-version-unsupported';
      expect(
        await runInDurableObject(history, instance =>
          requireAuthoredWorkerConfig().managedRuntime.runPromise(
            instance.actorVersionRepoFanout.drain().pipe(Effect.flip),
          ),
        ),
      ).toMatchObject({ code });
      {
        using fanout = await history.actorVersionRepoFanout;
        expect(
          (await fanout.subscribe({ ...actorKey, currentIndex: 1 })).result,
        ).toMatchObject({ _tag: 'Failure', failure: { code } });
      }
      expect(
        await runInDurableObject(history, ({ db, schema }) => ({
          commands: db.select().from(schema.commands).all(),
          subscribers: db
            .select()
            .from(schema.actorVersionRepoFanoutSubscribers)
            .all(),
        })),
      ).toEqual(retained);
      expect(
        await runInDurableObject(history, (_, { storage }) =>
          storage.getAlarm(),
        ),
      ).not.toBeNull();
    } finally {
      Object.defineProperty(config, 'system', { value: originalSystem });
    }
  }

  await evictDurableObject(actor);
  await evictDurableObject(history);
  unavailable.mockRestore();
  await runInDurableObject(history, (_, { storage }) =>
    storage.setAlarm(Date.now() + 60_000),
  );
  await runDurableObjectAlarm(history);
  expect(
    await runInDurableObject(actor, ({ db, schema, key }) => ({
      key,
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.exposedCommandOutbox).all(),
    })),
  ).toMatchObject({
    key: actorKey,
    resources: expectedResources,
    head: [{ serviceIndex: 1 }],
    outbox: [{ serviceIndex: 1 }],
  });
  expect(
    await runInDurableObject(history, ({ db, schema }) => ({
      commands: db.select().from(schema.commands).all(),
      subscribers: db
        .select()
        .from(schema.actorVersionRepoFanoutSubscribers)
        .all(),
    })),
  ).toEqual({
    commands: retained.commands,
    subscribers: [
      { actorName: 'operator', actorPath: '/one', acknowledgedServiceIndex: 1 },
    ],
  });
});

it('starts future release projections without prior release state', async () => {
  const parallel = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(parallelKey)),
  );
  expect((await parallel.awaitStartup()).result._tag).toBe('Success');
  expect(
    await runInDurableObject(parallel, ({ db, schema }) => ({
      resources: db.select().from(resources).all(),
      head: db.select().from(schema.materializationHead).all(),
    })),
  ).toEqual({ resources: [], head: [] });
});
