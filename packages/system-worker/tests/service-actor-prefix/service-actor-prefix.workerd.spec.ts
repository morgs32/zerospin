import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import type { IServiceSocketServerMessage } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { System } from '@zerospin/core/system/System';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ServiceActorVersionArchive } from '../../src/ServiceActorVersionArchive/ServiceActorVersionArchive.ts';
import { serviceActorVersionArchiveNameUtils } from '../../src/ServiceActorVersionArchive/serviceActorVersionArchiveName.ts';
import { appendExposedCommands } from '../../src/ServiceActorVersionChain/appendExposedCommands.ts';
import type { IServiceConnectionState } from '../../src/ServiceActorVersionChain/connectionState.ts';
import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { serviceActorVersionChainNameUtils } from '../../src/ServiceActorVersionChain/serviceActorVersionChainName.ts';
import { serviceActorVersionRepoNameUtils } from '../../src/ServiceActorVersionRepo/serviceActorVersionRepoName.ts';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import type { IServiceExposedPublication } from '../../src/serviceProjection/serviceProjectionDbConfig.ts';
import { EvaluatedServiceCommandSchema } from '../../src/ServiceVersionChain/evaluatedServiceCommand.ts';
import { requireAuthoredWorkerConfig } from '../../src/workerConfiguration/workerConfiguration.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { system } from './system.ts';

const key = {
  systemId: 'sys_servicePublication',
  serviceName: 'reservations',
  serviceVersion: 1,
  actorName: 'capabilityViewer',
  actorVersion: 1,
  actorPath: '/rsv_selected',
};
const claims = { reservationId: 'rsv_selected', role: 'reader' };
const actor = system.services.reservations.releases[1].actors.capabilityViewer;
const lock = makeServiceSessionLock({
  kind: 'service',
  serviceName: key.serviceName,
  serviceVersion: 1,
  actorName: key.actorName,
  actorVersion: 1,
  sessionName: 'viewer',
  claimsSchema: actor.identity.claimsSchema,
  contracts: { probeCapability: actor.contracts.probeCapability },
  models: { reservation },
  modelNames: ['reservation'],
});
const headers = {
  Upgrade: 'websocket',
  'x-zerospin-service-name': key.serviceName,
  'x-zerospin-service-version': '1',
  'x-zerospin-actor-path': key.actorPath,
  'x-zerospin-session-name': 'viewer',
  'x-zerospin-service-session-lock': JSON.stringify(lock),
  'x-zerospin-claims': JSON.stringify(claims),
  'x-zerospin-producer': JSON.stringify('node_prefix'),
};
const resources = makeDrizzleSchemaFromTable(reservation.table);
const sockets: WebSocket[] = [];
let chain: ReturnType<typeof env.SERVICE_ACTOR_VERSION_CHAIN.getByName>;

beforeEach(async () => {
  await reset();
  chain = env.SERVICE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(serviceActorVersionChainNameUtils.makeName(key)),
  );
  const systemRepo = env.SYSTEM_REPO.getByName(key.systemId);
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
});
afterEach(async () => {
  for (const socket of sockets) socket.close();
  sockets.length = 0;
  vi.restoreAllMocks();
  await reset();
});

it('publishes and proves snapshot N even when N+1 commits during its checkpoint read', async () => {
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const command = {
    id: makeNodeCommandId('node_prefix', 1),
    commandName: 'createReservation',
    contractVersion: 1,
    serviceName: key.serviceName,
    serviceVersion: 1,
    payload: JSON.stringify({
      reservationId: 'rsv_selected',
      expiresAt: 60_000,
    }),
    kind: 'actor',
    actorName: key.actorName,
    actorVersion: 1,
    claims,
    nodeId: 'node_prefix',
    sessionName: 'viewer',
    pushIndex: 1,
  };
  const request = {
    serviceSessionLock: lock,
    claims,
    sessionName: 'viewer',
    nodeId: 'node_prefix',
  };
  const append = ServiceActorVersionChain.prototype.appendExposedCommands;
  const publication = vi
    .spyOn(ServiceActorVersionChain.prototype, 'appendExposedCommands')
    .mockImplementation(function (this: ServiceActorVersionChain, props) {
      return append.call(this, {
        ...props,
        sourceKey: { ...props.sourceKey, serviceVersion: 2 },
      });
    });
  const checkpoint = vi.spyOn(
    ServiceActorVersionChain.prototype,
    'getCheckpoint',
  );
  const invalid = {
    ...command,
    id: makeNodeCommandId(command.nodeId, 2),
    pushIndex: 2,
    payload: '{"reservationId":"rsv_selected","expiresAt":"tomorrow"}',
  };
  expect(
    (await source.admitServiceCommands({ commands: [command, invalid] }))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'decode-command-payload-failed' },
  });
  expect((await source.getServiceCommand({ serviceIndex: 1 })).result).toEqual({
    _tag: 'Success',
    success: null,
  });
  expect(
    (await source.admitServiceCommands({ commands: [command] })).result._tag,
  ).toBe('Success');
  expect((await source.executeCommandsThrough(1)).result._tag).toBe('Success');
  await expect
    .poll(() =>
      runInDurableObject(
        repo,
        ({ db, schema }) =>
          db.select().from(schema.materializationHead).get()?.serviceIndex,
      ),
    )
    .toBe(1);
  expect(await repo.getSnapshot(request)).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-history-publication-failed' },
    },
  });
  expect(checkpoint).not.toHaveBeenCalled();
  publication.mockRestore();
  checkpoint.mockRestore();
  const originalCheckpoint = ServiceActorVersionChain.prototype.getCheckpoint;
  let checkpointReached = false;
  let releaseCheckpoint: (() => void) | undefined;
  const racedCheckpoint = vi
    .spyOn(ServiceActorVersionChain.prototype, 'getCheckpoint')
    .mockImplementation(async function (this: ServiceActorVersionChain, props) {
      if (!checkpointReached) {
        checkpointReached = true;
        await new Promise<void>(resolve => {
          releaseCheckpoint = resolve;
        });
      }
      return originalCheckpoint.call(this, props);
    });
  const resolved = vi.spyOn(
    ServiceActorVersionChain.prototype,
    'getResolvedThrough',
  );
  const captured = repo.getSnapshot(request);
  await expect.poll(() => checkpointReached).toBe(true);
  try {
    expect(
      (
        await source.admitServiceCommands({
          commands: [
            {
              ...command,
              id: makeNodeCommandId('node_prefix', 2),
              pushIndex: 2,
              payload: JSON.stringify({
                reservationId: 'rsv_hidden',
                expiresAt: 60_001,
              }),
            },
          ],
        })
      ).result._tag,
    ).toBe('Success');
    expect((await source.executeCommandsThrough(2)).result._tag).toBe(
      'Success',
    );
    await expect
      .poll(() =>
        runInDurableObject(
          repo,
          ({ db, schema }) =>
            db.select().from(schema.materializationHead).get()?.serviceIndex,
        ),
      )
      .toBe(2);
    expect(await repo.getSnapshot(request)).toMatchObject({
      result: {
        _tag: 'Success',
        success: { serviceIndex: 2, resolvedThrough: 2 },
      },
    });
  } finally {
    await runInDurableObject(chain, () => {
      if (releaseCheckpoint === undefined) {
        expect.fail('Expected a held checkpoint read');
      }
      releaseCheckpoint();
    });
  }
  expect(await captured).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        serviceIndex: 1,
        resolvedThrough: 1,
        resources: [{ id: 'rsv_selected', expiresAt: 60_000 }],
      },
    },
  });
  expect(
    racedCheckpoint.mock.calls.map(([props]) => props?.serviceIndex),
  ).toEqual([1, 2]);
  expect(
    resolved.mock.calls.map(([props]) => props.throughServiceIndex),
  ).toEqual([2, 1]);
  expect(
    await runInDurableObject(repo, ({ db, schema }) => ({
      resources: db.select().from(resources).orderBy(resources.id).all(),
      head: db.select().from(schema.materializationHead).all(),
      outbox: db.select().from(schema.exposedCommandOutbox).all(),
    })),
  ).toMatchObject({
    resources: [{ id: 'rsv_hidden' }, { id: 'rsv_selected' }],
    head: [{ serviceIndex: 2 }],
    outbox: [],
  });
  const prefixCalls = resolved.mock.calls.length;
  racedCheckpoint.mockImplementation(
    async function (this: ServiceActorVersionChain, props) {
      const result = await originalCheckpoint.call(this, props);
      return result.result._tag === 'Success'
        ? {
            ...result,
            result: {
              ...result.result,
              success: {
                ...result.result.success,
                dispositionChainHash: 'f'.repeat(64),
              },
            },
          }
        : result;
    },
  );
  expect(await repo.getSnapshot(request)).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-history-checkpoint-conflict' },
    },
  });
  expect(resolved.mock.calls).toHaveLength(prefixCalls);
});

it('proves the full private prefix with structural claims independently of public payload decoding', async () => {
  const claims = {
    reservationId: 'rsv_selected',
    access: { role: 'reader', regions: ['north', 'south'] },
  };
  const owner = {
    actorName: key.actorName,
    actorVersion: 1,
    sessionName: 'viewer',
    nodeId: 'node_prefix',
    claims,
  };
  const failure = {
    _tag: 'ZerospinError',
    code: 'reservation-refused',
    scope: 'contract',
    message: 'Reservation refused',
    status: null,
    extra: {},
  } as const;
  const publications: IServiceExposedPublication[] = [1, 2, 3].map(
    serviceIndex => ({
      serviceIndex,
      id: `cmd_prefix_${serviceIndex}`,
      commandName: 'probeCapability',
      dispositionChainHash: String(serviceIndex).repeat(64),
      delta: { upserted: [], deleted: [] },
      commandResolution: {
        sessionName: owner.sessionName,
        claims: owner.claims,
        pushIndex: serviceIndex === 3 ? 2 : 1,
        nodeId: serviceIndex === 2 ? 'node_other' : owner.nodeId,
        failure: serviceIndex !== 3 ? failure : null,
      },
    }),
  );
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications,
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  const archive = env.SERVICE_ACTOR_VERSION_ARCHIVE.getByName(
    Effect.runSync(
      serviceActorVersionArchiveNameUtils.makeName({
        ...key,
        firstServiceIndex: 1,
      }),
    ),
  );
  const request = { owner, afterOutcomeIndex: 2, throughServiceIndex: 3 };
  expect(await chain.getResolvedThrough(request)).toMatchObject({
    result: { _tag: 'Success', success: 2 },
  });
  expect(
    await chain.getResolvedThrough({
      ...request,
      afterOutcomeIndex: 0,
      throughServiceIndex: 2,
    }),
  ).toMatchObject({ result: { _tag: 'Success', success: 1 } });
  expect(
    await chain.getResolvedThrough({
      ...request,
      owner: {
        ...owner,
        claims: {
          access: { regions: ['north', 'south'], role: 'reader' },
          reservationId: 'rsv_selected',
        },
      },
    }),
  ).toMatchObject({ result: { _tag: 'Success', success: 2 } });
  expect(
    await archive.getResolutionSummary({ owner, throughServiceIndex: 3 }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        count: 2,
        distinctCount: 2,
        minPushIndex: 1,
        maxPushIndex: 2,
        mismatches: 0,
      },
    },
  });
  expect(
    await archive.getPage({
      afterIndex: 0,
      maxIndex: 3,
      nodeId: owner.nodeId,
      afterPushIndex: 0,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        rows: [
          { id: 'cmd_prefix_1', commandResolution: { failure } },
          { id: 'cmd_prefix_3', commandResolution: { failure: null } },
        ],
      },
    },
  });
  expect(
    await runInDurableObject(chain, instance =>
      instance.getBrowserCommands({ afterServiceIndex: 0, models: {} }),
    ),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        commands: publications.map(publication => ({
          id: publication.id,
          failure: null,
        })),
      },
    },
  });
  for (const changedOwner of [
    {
      ...owner,
      claims: { ...claims, access: { ...claims.access, role: 'writer' } },
    },
    { ...owner, sessionName: 'anotherSession' },
  ]) {
    expect(
      await chain.getResolvedThrough({ ...request, owner: changedOwner }),
    ).toMatchObject({
      result: {
        _tag: 'Failure',
        failure: { code: 'node-recovery-caller-mismatch' },
      },
    });
  }
  const retainedArchive: Pick<ServiceActorVersionArchive, 'getPage'> = archive;
  expect(
    (await retainedArchive.getPage({ afterIndex: 0, maxIndex: 3 })).result,
  ).toEqual({
    _tag: 'Success',
    success: { rows: publications, lastIndex: 3 },
  });
  await runInDurableObject(archive, ({ db, schema }) => {
    db.update(schema.commandResolutions)
      .set({ claims: JSON.stringify({ ...claims, elevated: true }) })
      .where(eq(schema.commandResolutions.serviceIndex, 1))
      .run();
  });
  expect(await chain.getResolvedThrough(request)).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'node-recovery-caller-mismatch' },
    },
  });
  await runInDurableObject(archive, ({ db, schema }) => {
    db.update(schema.commandResolutions)
      .set({ claims: JSON.stringify(claims) })
      .where(eq(schema.commandResolutions.serviceIndex, 1))
      .run();
    db.update(schema.exposedCommands)
      .set({ delta: '{"upserted":false,"deleted":[]}' })
      .where(eq(schema.exposedCommands.serviceIndex, 1))
      .run();
  });
  expect(await chain.getResolvedThrough(request)).toMatchObject({
    result: { _tag: 'Success', success: 2 },
  });
  expect(
    await archive.getPage({
      afterIndex: 0,
      maxIndex: 3,
      nodeId: owner.nodeId,
      afterPushIndex: 0,
    }),
  ).toMatchObject({ result: { _tag: 'Failure' } });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: [
          {
            ...publications[2]!,
            serviceIndex: 4,
            id: 'cmd_prefix_gap',
            dispositionChainHash: '4'.repeat(64),
            commandResolution: {
              nodeId: owner.nodeId,
              sessionName: owner.sessionName,
              claims: owner.claims,
              pushIndex: 4,
              failure: null,
            },
          },
        ],
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    await chain.getResolvedThrough({ ...request, throughServiceIndex: 4 }),
  ).toMatchObject({
    result: { _tag: 'Failure', failure: { code: 'node-outcome-gap' } },
  });
});

it('replays a final tail and private backlog, and rejects an impossible private offset before sending payloads', async () => {
  const failure = {
    _tag: 'ZerospinError',
    code: 'private-command-denied',
    message: 'Private failure',
    status: null,
    extra: null,
  } as const;
  const publications: IServiceExposedPublication[] = Array.from(
    { length: 66 },
    (_, offset) => ({
      serviceIndex: offset + 1,
      id: `cmd_replay_${offset + 1}`,
      commandName: 'probeCapability',
      dispositionChainHash: (offset + 1).toString(16).padStart(64, '0'),
      delta: { upserted: [], deleted: [] },
      commandResolution:
        offset === 0 || offset === 1 || offset === 64
          ? {
              nodeId: offset === 1 ? 'node_foreign' : 'node_prefix',
              sessionName: 'viewer',
              claims,
              pushIndex: offset === 64 ? 2 : 1,
              failure: offset === 64 ? null : failure,
            }
          : null,
    }),
  );
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(0, 64),
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  const joined: {
    frames: IServiceSocketServerMessage[];
    closeCode?: number;
  }[] = [];
  for (const [index, cursor] of [
    { serviceIndex: 0, outcomeIndex: 0 },
    { serviceIndex: 65, outcomeIndex: 0 },
    { serviceIndex: 0, outcomeIndex: 3 },
  ].entries()) {
    const response = await chain.fetch(
      `https://actor/socket?_pk=replay_${index}`,
      { headers },
    );
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    const state: (typeof joined)[number] = { frames: [] };
    socket.addEventListener('message', event => {
      state.frames.push(JSON.parse(String(event.data)));
    });
    socket.addEventListener('close', event => {
      state.closeCode = event.code;
    });
    socket.accept();
    sockets.push(socket);
    joined.push(state);
    if (index === 0) {
      await runInDurableObject(chain, instance => {
        const connection =
          instance.getConnection<IServiceConnectionState>('replay_0');
        if (connection === undefined) {
          expect.fail('Expected a retained connection');
        }
        const send = connection.send;
        vi.spyOn(connection, 'send').mockImplementationOnce(message => {
          send.call(connection, message);
          Effect.runSync(
            appendExposedCommands(instance.db, {
              key,
              sourceKey: key,
              commands: publications.slice(64, 65),
            }),
          );
        });
      });
    }
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_prefix',
        ...cursor,
        dispositionChainHash:
          cursor.serviceIndex === 0
            ? genesisDispositionChainHash()
            : publications[64]?.dispositionChainHash,
      }),
    );
    if (index < 2) {
      await expect
        .poll(() => state.frames.at(-1)?.type)
        .toBe('replay-complete');
    } else {
      await expect.poll(() => state.closeCode).toBe(4003);
    }
  }
  expect(
    joined[0]?.frames.map(frame =>
      frame.type === 'commands'
        ? frame.commands.map(command => command.serviceIndex)
        : frame,
    ),
  ).toEqual([
    Array.from({ length: 64 }, (_, offset) => offset + 1),
    [65],
    {
      type: 'replay-complete',
      serviceIndex: 65,
      dispositionChainHash: publications[64]?.dispositionChainHash,
      outcomeIndex: 2,
    },
  ]);
  expect(
    joined[1]?.frames.flatMap(frame =>
      frame.type === 'commands'
        ? frame.commands.map(command => command.serviceIndex)
        : [],
    ),
  ).toEqual([1, 65]);
  expect(
    joined[0]?.frames
      .flatMap(frame => (frame.type === 'commands' ? frame.commands : []))
      .slice(0, 2)
      .map(command => command.failure),
  ).toEqual([failure, null]);
  expect(
    joined[1]?.frames.flatMap(frame =>
      frame.type === 'commands'
        ? frame.commands.map(command => command.failure)
        : [],
    ),
  ).toEqual([failure, null]);
  expect(joined[1]?.frames.at(-1)).toEqual({
    type: 'replay-complete',
    serviceIndex: 65,
    dispositionChainHash: publications[64]?.dispositionChainHash,
    outcomeIndex: 2,
  });
  expect(joined[2]?.frames).toEqual([
    { type: 'state-required', reason: 'server-failure' },
  ]);
  expect(
    await runInDurableObject(chain, instance => ({
      locks: instance.db.select().from(instance.schema.connectionLocks).all(),
      phases: Array.from(
        instance.getConnections<IServiceConnectionState>(),
        connection => connection.state?.phase,
      ),
    })),
  ).toMatchObject({
    locks: [{ connectionId: 'replay_0' }, { connectionId: 'replay_1' }],
    phases: ['live', 'live'],
  });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(65),
      })
    ).result._tag,
  ).toBe('Success');
  for (const state of joined.slice(0, 2)) {
    await expect
      .poll(() => state.frames.at(-1))
      .toMatchObject({ type: 'commands', commands: [{ serviceIndex: 66 }] });
  }
});

it('archives complete private publications through lost replies and rollover while bounding only unarchived backlog', async () => {
  const owner = {
    actorName: key.actorName,
    actorVersion: key.actorVersion,
    sessionName: 'viewer',
    claims,
    nodeId: 'node_archive',
  };
  const publications: IServiceExposedPublication[] = Array.from(
    { length: 66 },
    (_, offset) => ({
      serviceIndex: offset + 1,
      id: `cmd_archive_${offset + 1}`,
      commandName: 'probeCapability',
      dispositionChainHash: (offset + 1).toString(16).padStart(64, '0'),
      delta: { upserted: [], deleted: [] },
      commandResolution:
        offset === 0 || offset >= 64
          ? {
              nodeId: owner.nodeId,
              sessionName: owner.sessionName,
              claims: owner.claims,
              pushIndex: offset === 0 ? 1 : offset - 62,
              failure: null,
            }
          : null,
    }),
  );
  let archiveFault: 'offline' | 'lost reply' | null = 'offline';
  let lostReplies = 0;
  const appendArchive =
    ServiceActorVersionArchive.prototype.appendExposedCommands;
  vi.spyOn(
    ServiceActorVersionArchive.prototype,
    'appendExposedCommands',
  ).mockImplementation(
    async function (this: ServiceActorVersionArchive, props) {
      if (archiveFault === 'offline') throw new Error('Archive unavailable');
      const reply = await appendArchive.call(this, props);
      if (archiveFault === 'lost reply' && reply.result._tag === 'Success') {
        lostReplies += 1;
        throw new Error(
          'Lost Archive reply after durable public/private commit',
        );
      }
      return reply;
    },
  );
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(0, 64),
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(64),
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-actor-archive-backlog-full' },
  });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(0, 1),
      })
    ).result._tag,
  ).toBe('Success');
  archiveFault = 'lost reply';
  await expect
    .poll(
      async () =>
        Exit.isFailure(
          await runInDurableObject(chain, instance =>
            Effect.runPromise(instance.archiveFanout.drain().pipe(Effect.exit)),
          ),
        ) && lostReplies > 0,
    )
    .toBe(true);
  expect(
    await runInDurableObject(chain, ({ db, schema }) => ({
      head: db.select().from(schema.historyHead).get(),
      cursor: db.select().from(schema.archiveFanoutSubscribers).get(),
      publicCount: db.select().from(schema.exposedCommands).all().length,
      privateCount: db.select().from(schema.commandResolutions).all().length,
    })),
  ).toMatchObject({
    head: { serviceIndex: 64 },
    cursor: { acknowledgedServiceIndex: 0 },
    publicCount: 64,
    privateCount: 1,
  });
  archiveFault = null;
  await evictDurableObject(chain);
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  const firstArchive = env.SERVICE_ACTOR_VERSION_ARCHIVE.getByName(
    Effect.runSync(
      serviceActorVersionArchiveNameUtils.makeName({
        ...key,
        firstServiceIndex: 1,
      }),
    ),
  );
  expect(
    await firstArchive.getExposedCommand({ serviceIndex: 1 }),
  ).toMatchObject({ result: { _tag: 'Success', success: publications[0] } });
  await runInDurableObject(firstArchive, instance => {
    vi.spyOn(instance.db, 'transaction').mockImplementationOnce(() => {
      throw new Error('Failed query: insert into exposedCommands', {
        cause: new Error('database or disk is full: SQLITE_FULL'),
      });
    });
  });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(64),
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    await runInDurableObject(chain, ({ db, schema }) => ({
      ranges: db.select().from(schema.archives).all(),
      cursor: db.select().from(schema.archiveFanoutSubscribers).get(),
      publicRows: db.select().from(schema.exposedCommands).all(),
      privateRows: db.select().from(schema.commandResolutions).all(),
    })),
  ).toEqual({
    ranges: [{ firstServiceIndex: 1 }, { firstServiceIndex: 65 }],
    cursor: { singletonId: 1, acknowledgedServiceIndex: 66 },
    publicRows: [],
    privateRows: [],
  });
  expect(
    await chain.getResolvedThrough({
      owner,
      afterOutcomeIndex: 0,
      throughServiceIndex: 64,
    }),
  ).toMatchObject({ result: { _tag: 'Success', success: 1 } });
  expect(
    await chain.getResolvedThrough({
      owner,
      afterOutcomeIndex: 3,
      throughServiceIndex: 66,
    }),
  ).toMatchObject({ result: { _tag: 'Success', success: 3 } });
  expect(
    await chain.getResolvedThrough({
      owner: { ...owner, claims: { ...claims, role: 'changed' } },
      afterOutcomeIndex: 0,
      throughServiceIndex: 66,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'node-recovery-caller-mismatch' },
    },
  });
  expect(await chain.getCheckpoint({ serviceIndex: 1 })).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        serviceIndex: 1,
        dispositionChainHash: publications[0]!.dispositionChainHash,
      },
    },
  });
  expect(
    await chain.getBrowserCommands({ afterServiceIndex: 64, models: {} }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        serviceIndex: 66,
        commands: [{ serviceIndex: 65 }, { serviceIndex: 66 }],
      },
    },
  });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: publications.slice(0, 1),
      })
    ).result._tag,
  ).toBe('Success');
  expect(
    await chain.appendExposedCommands({
      sourceKey: key,
      commands: [{ ...publications[0]!, commandResolution: null }],
    }),
  ).toMatchObject({
    result: { _tag: 'Success' },
  });
  expect(
    await firstArchive.appendExposedCommands({
      sourceKey: key,
      commands: [{ ...publications[0]!, commandResolution: null }],
    }),
  ).toMatchObject({
    result: { _tag: 'Failure', failure: { code: 'exposed-command-conflict' } },
  });
  const readArchive = vi
    .spyOn(ServiceActorVersionArchive.prototype, 'getExposedCommand')
    .mockRejectedValue(new Error('Old Archive unavailable'));
  expect(
    await chain.appendExposedCommands({
      sourceKey: key,
      commands: [
        { ...publications[0]!, commandResolution: null },
        {
          ...publications[65]!,
          serviceIndex: 67,
          id: 'cmd_archive_67',
          commandResolution: null,
        },
      ],
    }),
  ).toMatchObject({ result: { _tag: 'Success' } });
  expect(readArchive).not.toHaveBeenCalled();
  expect(
    await chain.appendExposedCommands({
      sourceKey: { ...key, actorPath: '/another' },
      commands: publications.slice(0, 1),
    }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'projection-history-source-mismatch' },
    },
  });
  expect(
    await chain.appendExposedCommands({
      sourceKey: key,
      commands: [{ ...publications[0]!, dispositionChainHash: 'invalid' }],
    }),
  ).toMatchObject({
    result: { _tag: 'Failure', failure: { code: 'exposed-command-invalid' } },
  });
  readArchive.mockRestore();
  expect(
    await firstArchive.getExposedCommand({ serviceIndex: 1 }),
  ).toMatchObject({
    result: { _tag: 'Success', success: publications[0] },
  });
});

it('bounds pending Actor publications before resource changes and drains them before cold catch-up', async () => {
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  const source = env.SERVICE_VERSION_CHAIN.getByName(
    'svc_sys_servicePublication/reservations/1',
  );
  let previousDispositionChainHash = genesisDispositionChainHash();
  const commands = Array.from({ length: 66 }, (_, offset) => {
    const serviceIndex = offset + 1;
    const id = `cmd_pending_${serviceIndex}`;
    const outcome = {
      result: { _tag: 'Success' as const, success: null },
      finalizedAt: new Date(1_000 + serviceIndex),
    };
    const dispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash,
      serviceIndex,
      commandId: id,
      outcome,
    });
    previousDispositionChainHash = dispositionChainHash;
    return Schema.decodeUnknownSync(
      Schema.toType(EvaluatedServiceCommandSchema),
    )({
      serviceName: key.serviceName,
      serviceVersion: 1,
      serviceIndex,
      id,
      commandName: 'createReservation',
      contractVersion: 1,
      payload: JSON.stringify({
        reservationId: 'rsv_selected',
        expiresAt: serviceIndex,
      }),
      kind: 'system',
      outcome,
      dispositionChainHash,
      operations: [
        {
          operationIndex: 0,
          operationName: offset === 0 ? 'create' : 'update',
          modelName: 'reservation',
          modelVersion: 1,
          resourceId: 'rsv_selected',
          body: JSON.stringify({ attributes: { expiresAt: serviceIndex } }),
        },
      ],
    });
  });
  const subscriber = await repo.actorVersionRepoFanoutSubscriber({
    systemId: key.systemId,
    serviceName: key.serviceName,
    serviceVersion: 1,
  });
  expect(
    await subscriber.receive({ rows: commands, lastIndex: 66 }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'service-projection-publication-batch-too-large' },
    },
  });
  expect(
    await runInDurableObject(repo, ({ db, schema }) => ({
      head:
        db.select().from(schema.materializationHead).get()?.serviceIndex ?? 0,
      pending: db.select().from(schema.exposedCommandOutbox).all().length,
      resources: db.select().from(resources).all(),
    })),
  ).toEqual({ head: 0, pending: 0, resources: [] });
  const publication = vi
    .spyOn(ServiceActorVersionChain.prototype, 'appendExposedCommands')
    .mockRejectedValue(new Error('Actor publication unavailable'));
  expect(
    (await source.appendEvaluatedCommands({ commands: commands.slice(0, 64) }))
      .result._tag,
  ).toBe('Success');
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).get()?.serviceIndex,
        pending: db.select().from(schema.exposedCommandOutbox).all().length,
        resources: db
          .select()
          .from(resources)
          .all()
          .map(row => row.expiresAt),
      })),
    )
    .toEqual({ head: 64, pending: 64, resources: [64] });
  expect(
    await subscriber.receive({ rows: commands.slice(64), lastIndex: 66 }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'service-projection-publication-backlog-full' },
    },
  });
  expect(
    await subscriber.receive({ rows: commands.slice(0, 64), lastIndex: 64 }),
  ).toMatchObject({
    result: { _tag: 'Success' },
  });
  expect(
    await runInDurableObject(repo, ({ db, schema }) => ({
      head: db.select().from(schema.materializationHead).get()?.serviceIndex,
      pending: db.select().from(schema.exposedCommandOutbox).all().length,
      resources: db
        .select()
        .from(resources)
        .all()
        .map(row => row.expiresAt),
    })),
  ).toEqual({ head: 64, pending: 64, resources: [64] });
  await runInDurableObject(source, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  expect(
    (await source.appendEvaluatedCommands({ commands: commands.slice(64) }))
      .result._tag,
  ).toBe('Success');
  subscriber[Symbol.dispose]();
  await evictDurableObject(repo);
  publication.mockRestore();
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  await expect
    .poll(() =>
      runInDurableObject(repo, ({ db, schema }) => ({
        head: db.select().from(schema.materializationHead).get()?.serviceIndex,
        pending: db.select().from(schema.exposedCommandOutbox).all().length,
        resources: db
          .select()
          .from(resources)
          .all()
          .map(row => row.expiresAt),
      })),
    )
    .toEqual({ head: 66, pending: 0, resources: [66] });
});

it('keeps cold Actor history and archival recovery available after release removal while refusing sockets', async () => {
  const publication: IServiceExposedPublication = {
    serviceIndex: 1,
    id: 'cmd_retired',
    commandName: 'probeCapability',
    dispositionChainHash: '1'.repeat(64),
    delta: { upserted: [], deleted: [] },
    commandResolution: {
      nodeId: 'node_prefix',
      pushIndex: 1,
      sessionName: 'viewer',
      claims,
      failure: null,
    },
  };
  const archive = vi
    .spyOn(ServiceActorVersionArchive.prototype, 'appendExposedCommands')
    .mockRejectedValue(new Error('Archive temporarily unavailable'));
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: [publication],
      })
    ).result._tag,
  ).toBe('Success');
  const response = await chain.fetch(
    'https://actor/socket?_pk=retired_hibernated',
    { headers },
  );
  const socket = response.webSocket;
  if (socket === null) expect.fail('Expected an Actor WebSocket');
  const frames: IServiceSocketServerMessage[] = [];
  let closeCode: number | undefined;
  socket.addEventListener('message', event => {
    frames.push(JSON.parse(String(event.data)));
  });
  socket.addEventListener('close', event => {
    closeCode = event.code;
  });
  socket.accept();
  sockets.push(socket);
  const retiredSystem = makeSystem({
    name: system.name,
    aggregates: {},
    services: {},
  });
  const systemRepo = env.SYSTEM_REPO.getByName(key.systemId);
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: makeSystemSpec({ system: retiredSystem }),
      })
    ).result._tag,
  ).toBe('Success');
  const ownerConfig = requireAuthoredWorkerConfig();
  const descriptor = Object.getOwnPropertyDescriptor(ownerConfig, 'system');
  if (descriptor === undefined) expect.fail('Expected the executing System');
  const runPromise = ownerConfig.managedRuntime.runPromise.bind(
    ownerConfig.managedRuntime,
  );
  const runSyncExit = ownerConfig.managedRuntime.runSyncExit.bind(
    ownerConfig.managedRuntime,
  );
  const executingSync = vi
    .spyOn(ownerConfig.managedRuntime, 'runSyncExit')
    .mockImplementation(program =>
      runSyncExit(program.pipe(Effect.provideService(System, retiredSystem))),
    );
  const executing = vi
    .spyOn(ownerConfig.managedRuntime, 'runPromise')
    .mockImplementation((program, options) =>
      runPromise(
        program.pipe(Effect.provideService(System, retiredSystem)),
        options,
      ),
    );
  Object.defineProperty(ownerConfig, 'system', {
    configurable: true,
    value: retiredSystem,
  });
  archive.mockRestore();
  try {
    await evictDurableObject(chain);
    expect(await chain.getCheckpoint({ serviceIndex: 1 })).toMatchObject({
      result: {
        _tag: 'Success',
        success: {
          serviceIndex: 1,
          dispositionChainHash: publication.dispositionChainHash,
        },
      },
    });
    await expect
      .poll(() =>
        runInDurableObject(
          chain,
          ({ db, schema }) =>
            db.select().from(schema.archiveFanoutSubscribers).get()
              ?.acknowledgedServiceIndex,
        ),
      )
      .toBe(1);
    expect(
      await chain.getBrowserCommands({ afterServiceIndex: 0, models: {} }),
    ).toMatchObject({
      result: {
        _tag: 'Success',
        success: { commands: [{ id: publication.id }] },
      },
    });
    expect(
      await chain.getResolvedThrough({
        owner: {
          actorName: key.actorName,
          actorVersion: 1,
          nodeId: 'node_prefix',
          sessionName: 'viewer',
          claims,
        },
        afterOutcomeIndex: 0,
        throughServiceIndex: 1,
      }),
    ).toMatchObject({ result: { _tag: 'Success', success: 1 } });
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_prefix',
        serviceIndex: 0,
        outcomeIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect.poll(() => closeCode).toBe(4003);
    expect(frames.filter(frame => frame.type === 'commands')).toEqual([]);
    const refused = await chain.fetch('https://actor/socket?_pk=retired_new', {
      headers,
    });
    const refusedSocket = refused.webSocket;
    if (refusedSocket === null) expect.fail('Expected the refused socket');
    let refusedCode: number | undefined;
    refusedSocket.addEventListener('close', event => {
      refusedCode = event.code;
    });
    refusedSocket.accept();
    sockets.push(refusedSocket);
    await expect.poll(() => refusedCode).toBe(4004);
  } finally {
    executing.mockRestore();
    executingSync.mockRestore();
    Object.defineProperty(ownerConfig, 'system', descriptor);
  }
});
