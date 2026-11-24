import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import * as shapeIds from '@zerospin/shapes';
import {
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AggregateSessionApi } from '../../src/AggregateSessionApi/AggregateSessionApi.ts';
import { getNativeSystemApi } from '../../src/getNativeSystemApi/getNativeSystemApi.ts';
import { getServiceVersionChain } from '../../src/ownerOperations/releaseRepoNamespaces.ts';
import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { serviceActorVersionChainNameUtils } from '../../src/ServiceActorVersionChain/serviceActorVersionChainName.ts';
import { ServiceActorVersionRepo } from '../../src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts';
import { serviceActorVersionRepoNameUtils } from '../../src/ServiceActorVersionRepo/serviceActorVersionRepoName.ts';
import { ServiceAgentVersionChain } from '../../src/ServiceAgentVersionChain/ServiceAgentVersionChain.ts';
import type { ServiceAgentVersionRepo } from '../../src/ServiceAgentVersionRepo/ServiceAgentVersionRepo.ts';
import * as workerConfiguration from '../../src/workerConfiguration/workerConfiguration.ts';
import {
  recordReservationWorkRequests,
  resetRecordReservationWork,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { system } from './system.ts';

beforeEach(() => {
  resetRecordReservationWork();
});

type IProjection = ServiceActorVersionRepo | ServiceAgentVersionRepo;
type ISelectedChain = ServiceActorVersionChain | ServiceAgentVersionChain;

const resources = shapeIds.makeDrizzleSchemaFromTable(reservation.table);

beforeEach(async () => {
  await reset();
  const systemRepo = env.SYSTEM_REPO.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
});
afterEach(() => vi.restoreAllMocks());

it.each(['actor', 'agent'] as const)(
  '%s projection commits resources, checkpoint and pending selected publication together at finalizedAt',
  async recipient => {
    const owner = {
      systemId: 'sys_servicePublication' as const,
      serviceName: 'reservations',
      serviceVersion: 1,
    };
    const actorKey = {
      ...owner,
      actorName: 'operator',
      actorVersion: 1,
      actorPath: '/one',
    };
    const projection =
      recipient === 'actor'
        ? env.SERVICE_ACTOR_VERSION_REPO.getByName(
            Effect.runSync(serviceActorVersionRepoNameUtils.makeName(actorKey)),
          )
        : env.SERVICE_AGENT_VERSION_REPO.getByName(
            'sagr_sys_servicePublication/reservations/1/projectionReader/1',
          );
    const selectedHistory =
      recipient === 'actor'
        ? env.SERVICE_ACTOR_VERSION_CHAIN.getByName(
            Effect.runSync(
              serviceActorVersionChainNameUtils.makeName(actorKey),
            ),
          )
        : env.SERVICE_AGENT_VERSION_CHAIN.getByName(
            'sagc_sys_servicePublication/reservations/1/projectionReader/1',
          );
    const history = await Effect.runPromise(
      getServiceVersionChain({ key: owner }),
    );
    if (recipient === 'actor') {
      await runInDurableObject(history, async (instance, { storage }) => {
        // Deliver the retained page explicitly so the fault is caught within the projection.
        vi.spyOn(instance.actorVersionRepoFanout, 'wake').mockReturnValue(
          Effect.void,
        );
        vi.spyOn(instance.agentVersionRepoFanout, 'wake').mockReturnValue(
          Effect.void,
        );
        await storage.deleteAlarm();
      });
    }
    await projection.awaitStartup();
    if (recipient === 'actor') {
      await runInDurableObject(history, (_, { storage }) =>
        storage.deleteAlarm(),
      );
    }
    const publication = vi
      .spyOn(
        recipient === 'actor'
          ? ServiceActorVersionChain.prototype
          : ServiceAgentVersionChain.prototype,
        'appendExposedCommands',
      )
      .mockRejectedValue(new Error('Selected history publication unavailable'));

    const source = env.SERVICE_CHAIN.getByName(
      'sc_sys_servicePublication/reservations',
    );
    expect(
      (
        await source.admitFromServiceChain({
          source: {
            systemId: 'sys_servicePublication',
            serviceName: 'reservations',
          },
          position: { sourceIndex: 1, operationIndex: 0 },
          command: {
            id: 'cmd_projection',
            commandName: 'createReservation',
            contractVersion: 1,
            payload: JSON.stringify({
              reservationId: 'rsv_projection',
              expiresAt: 60_000,
            }),
            serviceName: 'reservations',
            serviceVersion: 1,
            kind: 'system',
          },
        })
      ).result._tag,
    ).toBe('Success');
    expect((await source.executeCommandsThrough(1)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(
        async () =>
          (await history.getEvaluatedCommand({ serviceIndex: 1 })).result,
      )
      .toMatchObject({ _tag: 'Success', success: { id: 'cmd_projection' } });
    const retained = (await history.getEvaluatedCommand({ serviceIndex: 1 }))
      .result;
    if (retained._tag !== 'Success' || retained.success === null) {
      expect.fail(JSON.stringify(retained));
    }
    const command = retained.success;
    const newCommandIds = vi.spyOn(shapeIds, 'makeIdFromAbbreviation');
    const providerRequests = recordReservationWorkRequests.length;
    if (recipient === 'actor') {
      await runInDurableObject(history, (_, { storage }) =>
        storage.deleteAlarm(),
      );
    }
    const query = makeQueryDbVersion({
      models: { reservation },
    }).query.reservation.findMany();
    // This test invokes the System Worker API inside the owner release's test isolate.
    using _servingSpec = vi
      .spyOn(workerConfiguration, 'readExecutingSystemSpec')
      .mockReturnValue(makeSystemSpec({ system }));
    const canonicalResources = await Effect.runPromise(
      getNativeSystemApi(owner.systemId).executeServiceQuery({
        serviceName: owner.serviceName,
        serviceVersion: owner.serviceVersion,
        query,
      }),
    );
    vi.spyOn(Date, 'now').mockReturnValue(
      command.outcome.finalizedAt.getTime() + 100_000,
    );

    await runInDurableObject(projection, ({ db }: IProjection) => {
      db.run(
        sql`CREATE TRIGGER reject_selected_publication BEFORE INSERT ON exposedCommandOutbox BEGIN SELECT RAISE(ABORT, 'selected-publication-unavailable'); END`,
      );
    });
    await runInDurableObject(projection, async (instance: IProjection) => {
      const subscriber =
        instance instanceof ServiceActorVersionRepo
          ? instance.actorVersionRepoFanoutSubscriber(owner)
          : instance.agentVersionRepoFanoutSubscriber(owner);
      await expect(
        subscriber.receive({ rows: [command], lastIndex: 1 }),
      ).rejects.toThrow('Failed query');
    });
    expect(
      await runInDurableObject(projection, ({ db, schema }: IProjection) => ({
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.exposedCommandOutbox).all(),
      })),
    ).toEqual({ resources: [], head: [], outbox: [] });

    await runInDurableObject(projection, ({ db }: IProjection) => {
      db.run(sql`DROP TRIGGER reject_selected_publication`);
    });
    using subscriber =
      recipient === 'actor'
        ? await env.SERVICE_ACTOR_VERSION_REPO.getByName(
            Effect.runSync(serviceActorVersionRepoNameUtils.makeName(actorKey)),
          ).actorVersionRepoFanoutSubscriber(owner)
        : await env.SERVICE_AGENT_VERSION_REPO.getByName(
            'sagr_sys_servicePublication/reservations/1/projectionReader/1',
          ).agentVersionRepoFanoutSubscriber(owner);
    expect(
      (await subscriber.receive({ rows: [command], lastIndex: 1 })).result._tag,
    ).toBe('Success');
    await expect.poll(() => publication.mock.calls.length).toBeGreaterThan(0);
    const pending = await runInDurableObject(
      projection,
      ({ db, schema }: IProjection) => ({
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.exposedCommandOutbox).all(),
      }),
    );
    expect(pending.resources).toEqual(canonicalResources);
    expect(pending.resources[0]?.createdAt).toEqual(
      command.outcome.finalizedAt,
    );
    expect(pending.head).toEqual([
      {
        singletonId: 1,
        serviceIndex: 1,
        dispositionChainHash: command.dispositionChainHash,
      },
    ]);
    expect(pending.outbox).toMatchObject([
      {
        id: command.id,
        serviceIndex: 1,
        dispositionChainHash: command.dispositionChainHash,
      },
    ]);
    expect(
      await runInDurableObject(
        selectedHistory,
        ({ db, schema }: ISelectedChain) =>
          db.select().from(schema.exposedCommands).all(),
      ),
    ).toEqual([]);

    expect(
      (await subscriber.receive({ rows: [command], lastIndex: 1 })).result._tag,
    ).toBe('Success');
    expect(
      await runInDurableObject(projection, ({ db, schema }: IProjection) => ({
        resources: db.select().from(resources).all(),
        head: db.select().from(schema.materializationHead).all(),
        outbox: db.select().from(schema.exposedCommandOutbox).all(),
      })),
    ).toEqual(pending);

    expect(newCommandIds).not.toHaveBeenCalled();
    expect(recordReservationWorkRequests).toHaveLength(providerRequests);
    publication.mockRestore();
    await runInDurableObject(projection, (_, { storage }) =>
      storage.setAlarm(Date.now() + 60_000),
    );
    await runDurableObjectAlarm(projection);
    await expect
      .poll(() =>
        runInDurableObject(projection, ({ db, schema }: IProjection) =>
          db.select().from(schema.exposedCommandOutbox).all(),
        ),
      )
      .toEqual([]);
    // Actor history may already have moved into its archive after acknowledgement.
    expect(
      await selectedHistory.getBrowserCommands({
        afterServiceIndex: 0,
        models: {},
      }),
    ).toMatchObject({
      result: {
        _tag: 'Success',
        success: {
          serviceIndex: 1,
          commands: pending.outbox.map(
            ({ id, serviceIndex, dispositionChainHash, commandName }) => ({
              id,
              serviceIndex,
              dispositionChainHash,
              commandName,
            }),
          ),
        },
      },
    });
  },
);

it('constructs AggregateSessionApi with snapshot access and no administrative Service reads', () => {
  const api = new AggregateSessionApi({
    systemId: 'sys_servicePublication',
    aggregateName: 'account',
    aggregateVersion: 1,
    aggregateId: 'acc_session',
    actorName: 'viewer',
    actorVersion: 1,
    actorPath: '/one',
    claims: { aggregateId: 'acc_session', viewerId: 'one' },
    sessionName: 'reader',
    aggregateSessionLock: {
      sessionName: 'reader',
      origin: {
        kind: 'actor',
        actorName: 'viewer',
        actorVersion: 1,
      },
      contracts: {},
      models: {},
    },
  });
  expect('executeServiceQuery' in api).toBe(false);
  expect(typeof api.getSnapshot).toBe('function');
});
