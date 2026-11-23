import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import {
  ServiceSocketServerMessageSchema,
  type IServiceSocketServerMessage,
} from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IRpcEnvelope } from '@zerospin/logger';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { evictDurableObject, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schema from 'effect/Schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { validateServiceSessionLock } from '../../src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts';
import { ServiceActorVersionArchive } from '../../src/ServiceActorVersionArchive/ServiceActorVersionArchive.ts';
import type { IServiceConnectionState } from '../../src/ServiceActorVersionChain/connectionState.ts';
import { disposeConnection } from '../../src/ServiceActorVersionChain/disposeConnection.ts';
import { installConnection } from '../../src/ServiceActorVersionChain/installConnection.ts';
import { reconcileConnectionLocks } from '../../src/ServiceActorVersionChain/reconcileConnectionLocks.ts';
import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { serviceActorVersionChainNameUtils } from '../../src/ServiceActorVersionChain/serviceActorVersionChainName.ts';
import { serviceActorVersionRepoNameUtils } from '../../src/ServiceActorVersionRepo/serviceActorVersionRepoName.ts';
import { ServiceApi } from '../../src/ServiceApi/ServiceApi.ts';
import { genesisDispositionChainHash } from '../../src/serviceDispositionChainHash/serviceDispositionChainHash.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import type {
  ActorConnectionTestSystemRepo,
  HistoricalActorConnectionTestChain,
} from './actorConnectionTestWorkers.ts';
import config, { system } from './system.ts';

declare global {
  namespace Cloudflare {
    interface Env {
      ACTOR_CONNECTION_TEST_SYSTEM_REPO: DurableObjectNamespace<ActorConnectionTestSystemRepo>;
      HISTORICAL_ACTOR_CONNECTION_CHAIN: DurableObjectNamespace<HistoricalActorConnectionTestChain>;
      BUCKET: R2Bucket;
    }
  }
}

const key = {
  systemId: 'sys_servicePublication',
  serviceName: 'reservations',
  serviceVersion: 1,
  actorName: 'capabilityViewer',
  actorVersion: 1,
  actorPath: '/rsv_selected',
};
const claims = { reservationId: 'rsv_selected', role: 'reader' };
const locks = ([1, 2] as const).map(version => {
  const actor =
    system.services.reservations.releases[version].actors.capabilityViewer;
  return makeServiceSessionLock({
    kind: 'service',
    serviceName: key.serviceName,
    serviceVersion: version,
    actorName: key.actorName,
    actorVersion: version,
    sessionName: 'viewer',
    claimsSchema: actor.identity.claimsSchema,
    contracts: { probeCapability: actor.contracts.probeCapability },
    models: { reservation },
    modelNames: ['reservation'],
  });
});
const lock = locks[0]!;
const historicalLock = makeServiceSessionLock({
  kind: 'service',
  serviceName: key.serviceName,
  serviceVersion: 2,
  actorName: key.actorName,
  actorVersion: 2,
  sessionName: 'viewer',
  claimsSchema:
    system.services.reservations.releases[2].actors.capabilityViewer.identity
      .claimsSchema,
  contracts: {
    probeCapability:
      system.services.reservations.releases[1].actors.capabilityViewer.contracts
        .probeCapability,
  },
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
  'x-zerospin-producer': JSON.stringify('node_capability'),
};
type IJoinedSocket = {
  id: string;
  socket: WebSocket;
  frames: IServiceSocketServerMessage[];
  closeCode?: number;
};
const joined: IJoinedSocket[] = [];
const resources = makeDrizzleSchemaFromTable(reservation.table);

async function readTickets(
  systemRepo: Pick<
    ReturnType<typeof env.SYSTEM_REPO.getByName>,
    'getRepoTableRows'
  >,
) {
  const { result }: IRpcEnvelope<IRepoTableData> =
    await systemRepo.getRepoTableRows({ tableName: 'sessionWebSocketTickets' });
  if (result._tag !== 'Success') expect.fail(JSON.stringify(result));
  return result.success.rows;
}
let chain: ReturnType<typeof env.SERVICE_ACTOR_VERSION_CHAIN.getByName>;
let source: ReturnType<typeof env.SERVICE_CHAIN.getByName>;

beforeEach(async () => {
  await reset();
  chain = env.SERVICE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(serviceActorVersionChainNameUtils.makeName(key)),
  );
  source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/reservations',
  );
  const systemRepo = env.SYSTEM_REPO.getByName(key.systemId);
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
});
afterEach(async () => {
  for (const { socket } of joined) {
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
  joined.length = 0;
  vi.restoreAllMocks();
  await reset();
});

it('rejects a missing local Node at socket resume before replay', async () => {
  const previous = env.ZEROSPIN_LOCAL_DEVELOPMENT;
  env.ZEROSPIN_LOCAL_DEVELOPMENT = 'true';
  try {
    const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(
      Effect.runSync(serviceActorVersionRepoNameUtils.makeName(key)),
    );
    expect((await repo.awaitStartup()).result._tag).toBe('Success');
    const response = await chain.fetch('https://actor/socket?_pk=reset', {
      headers,
    });
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an Actor WebSocket');
    const state: IJoinedSocket = { id: 'reset', socket, frames: [] };
    socket.addEventListener('message', event => {
      state.frames.push(JSON.parse(String(event.data)));
    });
    socket.accept();
    joined.push(state);
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_capability',
        serviceIndex: 0,
        outcomeIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect
      .poll(() => state.frames.at(-1))
      .toEqual({
        type: 'state-required',
        reason: 'node-producer-not-registered',
      });
  } finally {
    if (previous === undefined) delete env.ZEROSPIN_LOCAL_DEVELOPMENT;
    else env.ZEROSPIN_LOCAL_DEVELOPMENT = previous;
  }
});

it('authenticates read-only Service claims before issuing and forwarding one exact socket admission', async () => {
  const systemRepo = env.ACTOR_CONNECTION_TEST_SYSTEM_REPO.getByName(
    key.systemId,
  );
  const actor =
    system.services.reservations.releases[1].actors.authenticatedViewer;
  const authenticatedKey = {
    ...key,
    actorName: 'authenticatedViewer',
    actorPath: '/rsv_authenticated',
  };
  const authenticatedClaims = {
    reservationId: 'rsv_authenticated',
    role: 'reader',
  };
  const authenticatedLock = makeServiceSessionLock({
    kind: 'service',
    serviceName: key.serviceName,
    serviceVersion: 1,
    actorName: authenticatedKey.actorName,
    actorVersion: 1,
    sessionName: 'authenticated',
    claimsSchema: actor.identity.claimsSchema,
    contracts: {},
    models: { reservation },
    modelNames: ['reservation'],
  });
  const api = new ServiceApi({
    systemName: system.name,
    serviceName: key.serviceName,
    serviceVersion: 1,
  });
  const forwarded: { url: string; headers: Record<string, string> }[] = [];
  const actorFetch = ServiceActorVersionChain.prototype.fetch;
  const fetch = vi
    .spyOn(ServiceActorVersionChain.prototype, 'fetch')
    .mockImplementation(function (this: ServiceActorVersionChain, request) {
      expect(this.key).toEqual(authenticatedKey);
      forwarded.push({
        url: request.url,
        headers: Object.fromEntries(request.headers),
      });
      return actorFetch.call(this, request);
    });

  for (const attempt of [
    {
      request: { credentials: { token: 'refused' } },
      code: 'service-authentication-failed',
    },
    {
      request: {
        credentials: { token: 'reader', reservationId: 'rsv_untrusted' },
      },
      code: 'authentication-credentials-invalid',
    },
    {
      request: { credentials: { token: 'invalid-result' } },
      code: 'identity-result-invalid',
    },
    {
      request: { claims: authenticatedClaims },
      code: 'admission-credentials-required',
    },
  ]) {
    const access = await api.admit({
      actorName: authenticatedKey.actorName,
      actorVersion: 1,
      ...attempt.request,
    });
    const session = await access.authorize({
      sessionName: authenticatedLock.sessionName,
      serviceSessionLock: authenticatedLock,
    });
    expect(
      await session.createWebSocketTicket({
        args: [{ serviceVersion: 1 }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: { _tag: 'Failure', failure: { code: attempt.code } },
    });
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(await readTickets(systemRepo)).toEqual([]);

  const access = await api.admit({
    actorName: authenticatedKey.actorName,
    actorVersion: 1,
    credentials: { token: 'reader' },
  });
  const session = await access.authorize({
    sessionName: authenticatedLock.sessionName,
    serviceSessionLock: authenticatedLock,
  });
  expect(
    await session.createWebSocketTicket({
      args: [{ serviceVersion: 1 }],
      traceContext: null,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Failure',
      failure: { code: 'service-session-state-required' },
    },
  });
  expect(
    await session.getSnapshot({
      args: [{ nodeId: null }],
      traceContext: null,
    }),
  ).toMatchObject({
    result: {
      _tag: 'Success',
      success: {
        serviceName: key.serviceName,
        serviceVersion: 1,
        actorName: authenticatedKey.actorName,
        actorVersion: 1,
        sessionName: authenticatedLock.sessionName,
        claims: authenticatedClaims,
        serviceIndex: 0,
        resources: [],
      },
    },
  });
  const previousLocal = env.ZEROSPIN_LOCAL_DEVELOPMENT;
  const previousHistory = env.ZEROSPIN_DEV_HISTORY;
  const previousHash = env.ZEROSPIN_DEV_STARTUP_SPEC_HASH;
  const retiredHistoryId = crypto.randomUUID();
  const developmentHistory = {
    systemId: key.systemId,
    id: crypto.randomUUID(),
    replaced: [retiredHistoryId],
  };
  env.ZEROSPIN_LOCAL_DEVELOPMENT = 'true';
  env.ZEROSPIN_DEV_HISTORY = JSON.stringify(developmentHistory);
  try {
    const spec = makeSystemSpec({ system });
    env.ZEROSPIN_DEV_STARTUP_SPEC_HASH = spec.hash;
    await systemRepo.clearAcceptedDevelopmentSpec();
    const open = () =>
      access.authorize({
        sessionName: authenticatedLock.sessionName,
        serviceSessionLock: authenticatedLock,
      });
    env.ZEROSPIN_DEV_STARTUP_SPEC_HASH = '0'.repeat(64);
    const changed = await open();
    expect(
      await changed.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: {
        _tag: 'Failure',
        failure: { code: 'zerospin-dev-system-spec-changed' },
      },
    });
    env.ZEROSPIN_DEV_STARTUP_SPEC_HASH = spec.hash;
    const starting = await open();
    expect(
      await starting.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: {
        _tag: 'Failure',
        failure: { code: 'node-development-system-starting', status: 503 },
      },
    });
    expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
      'Success',
    );
    const ready = await open();
    expect(
      await ready.getSnapshot({ args: [{ nodeId: null }], traceContext: null }),
    ).toMatchObject({
      result: { _tag: 'Success', success: { developmentHistory } },
    });

    expect(
      await session.getSnapshot({
        args: [{ nodeId: null }],
        traceContext: null,
      }),
    ).toMatchObject({
      result: { _tag: 'Success', success: { developmentHistory } },
    });
    const registration = { nodeId: 'node_after_clean', create: true };
    expect(
      await session.registerNode({
        args: [
          {
            ...registration,
            developmentHistoryId: retiredHistoryId,
          },
        ],
        traceContext: null,
      }),
    ).toMatchObject({
      result: {
        _tag: 'Failure',
        failure: { code: 'node-development-history-mismatch' },
      },
    });
    expect(
      await session.registerNode({
        args: [
          { ...registration, developmentHistoryId: developmentHistory.id },
        ],
        traceContext: null,
      }),
    ).toMatchObject({ result: { _tag: 'Success', success: 'registered' } });
  } finally {
    if (previousLocal === undefined) delete env.ZEROSPIN_LOCAL_DEVELOPMENT;
    else env.ZEROSPIN_LOCAL_DEVELOPMENT = previousLocal;
    if (previousHash === undefined) delete env.ZEROSPIN_DEV_STARTUP_SPEC_HASH;
    else env.ZEROSPIN_DEV_STARTUP_SPEC_HASH = previousHash;
    if (previousHistory === undefined) delete env.ZEROSPIN_DEV_HISTORY;
    else env.ZEROSPIN_DEV_HISTORY = previousHistory;
  }
  const issued = await session.createWebSocketTicket({
    args: [{ serviceVersion: 1 }],
    traceContext: null,
  });
  if (issued.result._tag !== 'Success') {
    expect.fail('Expected a session ticket');
  }
  const tickets = await readTickets(systemRepo);
  expect(tickets).toHaveLength(1);
  expect(
    JSON.parse(Schema.decodeUnknownSync(Schema.String)(tickets[0]?.admission)),
  ).toEqual({
    kind: 'serviceActor',
    nodeId: null,
    serviceName: key.serviceName,
    serviceVersion: 1,
    actorPath: authenticatedKey.actorPath,
    claims: authenticatedClaims,
    serviceSessionLock: authenticatedLock,
  });

  const request = new Request(
    `https://system/ws-service-session-commands?ticket=${issued.result.success.ticket}`,
    {
      headers: {
        Upgrade: 'websocket',
        'x-client-request': 'preserved',
        'x-zerospin-service-name': 'forged',
        'x-zerospin-service-version': '2',
        'x-zerospin-actor-path': '/forged',
        'x-zerospin-session-name': 'forged',
        'x-zerospin-claims': JSON.stringify({ role: 'writer' }),
        'x-zerospin-producer': JSON.stringify('node_forged'),
        'x-zerospin-service-session-lock': '{}',
        'x-zerospin-origin': JSON.stringify({ kind: 'system' }),
        'X-Zerospin-Untrusted': 'removed',
      },
    },
  );
  const response = await systemRepo.fetch(request);
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (socket === null) expect.fail('Expected the authenticated WebSocket');
  const connection: IJoinedSocket = {
    id: 'authenticated',
    socket,
    frames: [],
  };
  socket.addEventListener('message', event => {
    connection.frames.push(JSON.parse(String(event.data)));
  });
  socket.accept();
  joined.push(connection);
  expect(forwarded).toEqual([
    {
      url: 'https://system/ws-service-session-commands',
      headers: {
        upgrade: 'websocket',
        'x-client-request': 'preserved',
        'x-zerospin-service-name': key.serviceName,
        'x-zerospin-service-version': '1',
        'x-zerospin-actor-path': authenticatedKey.actorPath,
        'x-zerospin-session-name': authenticatedLock.sessionName,
        'x-zerospin-claims': JSON.stringify(authenticatedClaims),
        'x-zerospin-producer': 'null',
        'x-zerospin-service-session-lock': expect.any(String),
      },
    },
  ]);
  expect(
    JSON.parse(forwarded[0]!.headers['x-zerospin-service-session-lock']!),
  ).toEqual(authenticatedLock);
  const authenticatedChain = env.SERVICE_ACTOR_VERSION_CHAIN.getByName(
    Effect.runSync(
      serviceActorVersionChainNameUtils.makeName(authenticatedKey),
    ),
  );
  expect(
    await runInDurableObject(authenticatedChain, instance =>
      Array.from(
        instance.getConnections<IServiceConnectionState>(),
        connected => connected.state,
      ),
    ),
  ).toEqual([
    {
      phase: 'awaiting-resume',
      issuedNodeId: null,
      serviceName: key.serviceName,
      serviceVersion: 1,
      actorName: authenticatedKey.actorName,
      actorVersion: 1,
      actorPath: authenticatedKey.actorPath,
      sessionName: authenticatedLock.sessionName,
      claims: authenticatedClaims,
    },
  ]);
  socket.send(
    JSON.stringify({
      type: 'resume',
      nodeId: 'node_authenticated',
      serviceIndex: 0,
      outcomeIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    }),
  );
  await expect
    .poll(() => connection.frames.at(-1)?.type)
    .toBe('replay-complete');
  expect(await readTickets(systemRepo)).toEqual([]);
  expect((await systemRepo.fetch(request)).status).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves tickets before route admission and burns them before failed downstream upgrades', async () => {
  const systemRepo = env.ACTOR_CONNECTION_TEST_SYSTEM_REPO.getByName(
    key.systemId,
  );
  const admission = {
    kind: 'serviceActor' as const,
    nodeId: null,
    serviceName: key.serviceName,
    serviceVersion: 1,
    actorPath: key.actorPath,
    claims,
    serviceSessionLock: lock,
  };
  const issued = await systemRepo.createSessionWebSocketTicket({ admission });
  if (issued.result._tag !== 'Success') {
    expect.fail('Expected a session ticket');
  }
  const ticket = issued.result.success;
  const fetch = vi
    .spyOn(ServiceActorVersionChain.prototype, 'fetch')
    .mockImplementation(
      async () => new Response('Upgrade unavailable', { status: 409 }),
    );
  for (const invalid of [
    { path: '/not-a-socket', method: 'GET', upgrade: 'websocket', status: 404 },
    {
      path: '/ws-service-session-commands',
      method: 'POST',
      upgrade: 'none',
      status: 404,
    },
    {
      path: '/ws-service-session-commands',
      method: 'GET',
      upgrade: 'none',
      status: 426,
    },
    {
      path: '/ws-service-session-commands',
      method: 'GET',
      upgrade: 'websocket',
      query: `&ticket=${ticket}`,
      status: 400,
    },
    {
      path: '/ws-service-session-commands',
      method: 'GET',
      upgrade: 'websocket',
      query: '&untrusted=1',
      status: 400,
    },
    {
      path: '/ws-aggregate-session-commands',
      method: 'GET',
      upgrade: 'websocket',
      status: 401,
    },
  ]) {
    expect(
      (
        await systemRepo.fetch(
          new Request(
            `https://system${invalid.path}?ticket=${ticket}${invalid.query ?? ''}`,
            {
              method: invalid.method,
              headers: { Upgrade: invalid.upgrade },
            },
          ),
        )
      ).status,
    ).toBe(invalid.status);
    expect(await readTickets(systemRepo)).toHaveLength(1);
  }
  expect(fetch).not.toHaveBeenCalled();
  const url = `https://system/ws-service-session-commands?ticket=${ticket}`;
  expect(
    (
      await systemRepo.fetch(
        new Request(url, { headers: { Upgrade: 'websocket' } }),
      )
    ).status,
  ).toBe(409);
  expect(await readTickets(systemRepo)).toEqual([]);
  expect(
    (
      await systemRepo.fetch(
        new Request(url, { headers: { Upgrade: 'websocket' } }),
      )
    ).status,
  ).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(1);

  const retry = await systemRepo.createSessionWebSocketTicket({ admission });
  if (retry.result._tag !== 'Success') expect.fail('Expected a second ticket');
  fetch.mockRejectedValueOnce(new Error('Actor fetch unavailable'));
  const retryUrl = `https://system/ws-service-session-commands?ticket=${retry.result.success}`;
  expect(
    (
      await systemRepo.fetch(
        new Request(retryUrl, { headers: { Upgrade: 'websocket' } }),
      )
    ).status,
  ).toBe(500);
  expect(await readTickets(systemRepo)).toEqual([]);
  expect(
    (
      await systemRepo.fetch(
        new Request(retryUrl, { headers: { Upgrade: 'websocket' } }),
      )
    ).status,
  ).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('retains exact release selections across hibernation and rejects historical command versions', async () => {
  const selectedContract = lock.contracts.probeCapability;
  const secondLock = locks[1];
  const secondContract = secondLock?.contracts.probeCapability;
  if (
    selectedContract === undefined ||
    secondLock === undefined ||
    secondContract === undefined
  ) {
    expect.fail('Expected exact contracts for both registered releases');
  }
  for (const [index, rejected] of [
    {
      headers: {
        'x-zerospin-service-session-lock': JSON.stringify({
          ...lock,
          models: {},
        }),
      },
      installation: false,
    },
    {
      headers: {
        'x-zerospin-service-session-lock': JSON.stringify({
          ...lock,
          contracts: { probeCapability: { ...selectedContract, version: 2 } },
        }),
      },
      installation: false,
    },
    {
      headers: {
        'x-zerospin-claims': JSON.stringify({
          ...claims,
          reservationId: 'rsv_other',
        }),
      },
      installation: false,
    },
    {
      headers: { 'x-zerospin-claims': JSON.stringify({ ...claims, role: 1 }) },
      installation: false,
    },
    {
      headers: { 'x-zerospin-service-name': 'another-service' },
      installation: false,
    },
    { headers: {}, installation: true },
  ].entries()) {
    if (rejected.installation) {
      await runInDurableObject(chain, ({ db }) => {
        db.run(
          sql`CREATE TRIGGER reject_connection BEFORE INSERT ON connectionLocks BEGIN SELECT RAISE(ABORT, 'connection-installation-unavailable'); END`,
        );
      });
    }
    const response = await chain.fetch(
      `https://actor/socket?_pk=rejected_${index}`,
      { headers: { ...headers, ...rejected.headers } },
    );
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    const state: IJoinedSocket = {
      id: `rejected_${index}`,
      socket,
      frames: [],
    };
    socket.addEventListener('close', event => {
      state.closeCode = event.code;
    });
    socket.accept();
    joined.push(state);
    await expect
      .poll(() => state.closeCode)
      .toBe(rejected.installation ? 1011 : 4004);
    expect(
      await runInDurableObject(chain, instance => ({
        locks: instance.db.select().from(instance.schema.connectionLocks).all(),
        connections: Array.from(
          instance.getConnections(),
          connection => connection.id,
        ),
      })),
    ).toEqual({ locks: [], connections: [] });
    if (rejected.installation) {
      await runInDurableObject(chain, ({ db }) => {
        db.run(sql`DROP TRIGGER reject_connection`);
      });
    }
  }
  for (const invalidLock of [
    historicalLock, // V1 is registered on release 1, but release 2 selects V2.
    { ...secondLock, models: {} },
    {
      ...secondLock,
      contracts: { probeCapability: { ...secondContract, version: 99 } },
    },
    {
      ...secondLock,
      contracts: {
        unrelated: { ...secondContract, commandName: 'unrelated' },
      },
    },
  ]) {
    const exit = await config.managedRuntime.runPromise(
      validateServiceSessionLock({
        serviceName: key.serviceName,
        serviceVersion: 2,
        sessionName: 'viewer',
        serviceSessionLock: invalidLock,
      }).pipe(Effect.exit),
    );
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: {
        reasons: [
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'service-session-lock-unsupported',
            }),
          }),
        ],
      },
    });
  }
  const secondChain = env.HISTORICAL_ACTOR_CONNECTION_CHAIN.getByName(
    Effect.runSync(
      serviceActorVersionChainNameUtils.makeName({
        ...key,
        serviceVersion: 2,
        actorVersion: 2,
      }),
    ),
  );
  for (const selected of [
    { id: 'full', version: 1, nodeId: 'node_capability', lock },
    {
      id: 'empty',
      version: 1,
      nodeId: 'node_empty',
      lock: { ...lock, contracts: {}, models: {} },
    },
    {
      id: 'second_release',
      version: 2,
      nodeId: 'node_capability_two',
      lock: secondLock,
    },
    {
      id: 'second_peer',
      version: 2,
      nodeId: 'node_capability_peer',
      lock: secondLock,
    },
  ]) {
    const actorChain = selected.version === 1 ? chain : secondChain;
    const response = await actorChain.fetch(
      `https://actor/socket?_pk=${selected.id}`,
      {
        headers: {
          ...headers,
          'x-zerospin-service-version': String(selected.version),
          'x-zerospin-service-session-lock': JSON.stringify(selected.lock),
          'x-zerospin-producer': JSON.stringify(
            selected.id === 'empty' ? null : selected.nodeId,
          ),
        },
      },
    );
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    const state: IJoinedSocket = { id: selected.id, socket, frames: [] };
    socket.addEventListener('message', event => {
      state.frames.push(JSON.parse(String(event.data)));
    });
    socket.addEventListener('close', event => {
      state.closeCode = event.code;
    });
    socket.accept();
    joined.push(state);
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: selected.nodeId,
        serviceIndex: 0,
        outcomeIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect.poll(() => state.frames.at(-1)?.type).toBe('replay-complete');
  }
  expect(
    await runInDurableObject(chain, ({ db, schema }) =>
      db
        .select()
        .from(schema.connectionLocks)
        .orderBy(schema.connectionLocks.connectionId)
        .all(),
    ),
  ).toEqual([
    { connectionId: 'empty', contractVersions: '{}', modelNames: '[]' },
    {
      connectionId: 'full',
      contractVersions: '{"probeCapability":1}',
      modelNames: '["reservation"]',
    },
  ]);
  const full = joined.find(socket => socket.id === 'full');
  const empty = joined.find(socket => socket.id === 'empty');
  const second = joined.find(socket => socket.id === 'second_release');
  const secondPeer = joined.find(socket => socket.id === 'second_peer');
  if (
    full === undefined ||
    empty === undefined ||
    second === undefined ||
    secondPeer === undefined
  ) {
    expect.fail('Expected admitted connections');
  }
  expect(await secondChain.readConnectionLocks()).toEqual([
    {
      connectionId: 'second_peer',
      contractVersions: '{"probeCapability":2}',
      modelNames: '["reservation"]',
    },
    {
      connectionId: 'second_release',
      contractVersions: '{"probeCapability":2}',
      modelNames: '["reservation"]',
    },
  ]);
  await evictDurableObject(secondChain, { webSockets: 'hibernate' });
  expect(await secondChain.readConnectionPhases()).toEqual([
    { id: 'second_peer', phase: 'live' },
    { id: 'second_release', phase: 'live' },
  ]);
  const command = {
    id: 'cmd_capability',
    commandName: 'probeCapability',
    contractVersion: 1,
    payload: '{}',
    serviceName: key.serviceName,
    serviceVersion: 1,
    kind: 'actor',
    actorName: key.actorName,
    actorVersion: 1,
    claims,
    nodeId: 'node_capability',
    sessionName: 'viewer',
    pushIndex: 1,
  };
  for (const [connection, input] of [
    [full, { ...command, id: 'cmd_wrong_contract', contractVersion: 2 }],
    [
      full,
      {
        ...command,
        id: 'cmd_wrong_claims',
        claims: { ...claims, role: 'editor' },
      },
    ],
    [empty, { ...command, id: 'cmd_empty_capability', nodeId: 'node_empty' }],
    [
      second,
      {
        ...command,
        id: 'cmd_old_contract',
        serviceVersion: 2,
        actorVersion: 2,
        nodeId: 'node_capability_two',
      },
    ],
    [
      secondPeer,
      {
        ...command,
        id: 'cmd_unselected_version',
        contractVersion: 99,
        serviceVersion: 2,
        actorVersion: 2,
        nodeId: 'node_capability_peer',
      },
    ],
  ] as const) {
    connection.socket.send(
      JSON.stringify({ type: 'pushServiceCommand', command: input }),
    );
    await expect
      .poll(() => connection.frames.at(-1))
      .toMatchObject({
        type: 'serviceCommandAdmissionFailed',
        id: input.id,
        failure: { code: 'service-command-capability-mismatch' },
      });
  }
  expect(
    (await env.BUCKET.list({ prefix: 'actor-command-admission/' })).objects,
  ).toEqual([]);
  expect(
    await source.getRepoTableRows({ tableName: 'commands' }),
  ).toMatchObject({ result: { _tag: 'Success', success: { rows: [] } } });
  for (const [connection, version, contractVersion, nodeId] of [
    [full, 1, 1, 'node_capability'],
    [second, 2, 2, 'node_capability_two'],
    [secondPeer, 2, 2, 'node_capability_peer'],
  ] as const) {
    const id = makeNodeCommandId(nodeId, 1);
    connection.socket.send(
      JSON.stringify({
        type: 'pushServiceCommand',
        command: {
          ...command,
          id,
          contractVersion,
          serviceVersion: version,
          actorVersion: version,
          nodeId,
        },
      }),
    );
    await expect
      .poll(() =>
        connection.frames.some(
          frame => frame.type === 'serviceCommandAdmission' && frame.id === id,
        ),
      )
      .toBe(true);
    expect(
      Schema.decodeUnknownSync(
        Schema.fromJsonString(ServiceSocketServerMessageSchema),
      )(
        JSON.stringify(
          connection.frames.find(
            frame =>
              frame.type === 'serviceCommandAdmission' && frame.id === id,
          ),
        ),
        { onExcessProperty: 'error' },
      ),
    ).toEqual({ type: 'serviceCommandAdmission', id, pushIndex: 1 });
  }
  expect(
    await Promise.all(
      [1, 2, 3].map(async serviceIndex => {
        const retained = await source.getServiceCommand({ serviceIndex });
        if (
          retained.result._tag !== 'Success' ||
          retained.result.success === null
        ) {
          expect.fail(JSON.stringify(retained));
        }
        const { id, serviceVersion, contractVersion } = retained.result.success;
        return { id, serviceVersion, contractVersion };
      }),
    ),
  ).toEqual([
    {
      id: makeNodeCommandId('node_capability', 1),
      serviceVersion: 1,
      contractVersion: 1,
    },
    {
      id: makeNodeCommandId('node_capability_two', 1),
      serviceVersion: 2,
      contractVersion: 2,
    },
    {
      id: makeNodeCommandId('node_capability_peer', 1),
      serviceVersion: 2,
      contractVersion: 2,
    },
  ]);
  for (const [connection, retained] of [
    [
      secondPeer,
      {
        contractVersions: '{"probeCapability":99}',
        modelNames: '["reservation"]',
      },
    ],
    [second, { contractVersions: '{"probeCapability":2}', modelNames: '[]' }],
  ] as const) {
    await secondChain.replaceConnectionLock({
      connectionId: connection.id,
      ...retained,
    });
    connection.socket.send('{}');
    await expect.poll(() => connection.closeCode).toBe(4003);
    expect(connection.frames.at(-1)).toEqual({
      type: 'state-required',
      reason: 'connection-state-invalid',
    });
  }
  await runInDurableObject(chain, instance => {
    const connection = instance.getConnection<IServiceConnectionState>('full');
    if (connection?.state === null || connection === undefined) {
      expect.fail('Expected a live connection');
    }
    connection.setState({ ...connection.state, serviceVersion: 2 });
  });
  full.socket.send('{}');
  await expect.poll(() => full.closeCode).toBe(4003);
  expect(full.frames.at(-1)).toEqual({
    type: 'state-required',
    reason: 'connection-state-invalid',
  });
});

it('filters real Actor selections and private failures while isolating broadcast teardown from committed history', async () => {
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    Effect.runSync(serviceActorVersionRepoNameUtils.makeName(key)),
  );
  expect((await repo.awaitStartup()).result._tag).toBe('Success');
  for (const selected of [
    { id: 'reader', claims, lock },
    { id: 'editor', claims: { ...claims, role: 'editor' }, lock },
    { id: 'empty', claims, lock: { ...lock, contracts: {}, models: {} } },
    { id: 'invalid', claims, lock },
  ]) {
    const response = await chain.fetch(
      `https://actor/socket?_pk=${selected.id}`,
      {
        headers: {
          ...headers,
          'x-zerospin-claims': JSON.stringify(selected.claims),
          'x-zerospin-service-session-lock': JSON.stringify(selected.lock),
        },
      },
    );
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    const state: IJoinedSocket = { id: selected.id, socket, frames: [] };
    socket.addEventListener('message', event => {
      state.frames.push(JSON.parse(String(event.data)));
    });
    socket.addEventListener('close', event => {
      state.closeCode = event.code;
    });
    socket.accept();
    joined.push(state);
    socket.send(
      JSON.stringify({
        type: 'resume',
        nodeId: 'node_capability',
        serviceIndex: 0,
        outcomeIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      }),
    );
    await expect.poll(() => state.frames.at(-1)?.type).toBe('replay-complete');
  }
  const [reader, editor, empty, invalid] = joined;
  if (
    reader === undefined ||
    editor === undefined ||
    empty === undefined ||
    invalid === undefined
  ) {
    expect.fail('Expected admitted connections');
  }
  await runInDurableObject(chain, instance => {
    const connection =
      instance.getConnection<IServiceConnectionState>('invalid');
    if (connection === undefined || connection.state === null) {
      expect.fail('Expected a live connection');
    }
    connection.setState({ ...connection.state, actorPath: '/two' });
  });
  const commands = [1, 2, 3].map(index => ({
    id: makeNodeCommandId('node_capability', index),
    commandName: index === 3 ? 'performReservationWork' : 'createReservation',
    contractVersion: 1,
    payload: JSON.stringify({
      reservationId: index === 1 ? 'rsv_selected' : `rsv_hidden_${index}`,
      expiresAt: 60_000,
      ...(index === 3 ? { mode: 'failure' } : {}),
    }),
    serviceName: key.serviceName,
    serviceVersion: 1,
    kind: 'actor',
    actorName: key.actorName,
    actorVersion: 1,
    claims,
    nodeId: 'node_capability',
    sessionName: 'viewer',
    pushIndex: index,
  }));
  expect(
    (await source.admitServiceCommands({ commands })).result,
  ).toMatchObject({
    _tag: 'Success',
  });
  expect((await source.executeCommandsThrough(3)).result._tag).toBe('Success');
  for (const connection of [reader, editor, empty]) {
    await expect.poll(() => connection.frames.length).toBe(4);
  }
  const readerCommands = reader.frames.flatMap(frame =>
    frame.type === 'commands' ? frame.commands : [],
  );
  const editorCommands = editor.frames.flatMap(frame =>
    frame.type === 'commands' ? frame.commands : [],
  );
  const emptyCommands = empty.frames.flatMap(frame =>
    frame.type === 'commands' ? frame.commands : [],
  );
  expect(
    readerCommands.map(command =>
      command.delta.upserted.map(resource => resource.id),
    ),
  ).toEqual([['rsv_selected'], [], []]);
  expect(editorCommands.map(command => command.delta)).toEqual(
    readerCommands.map(command => command.delta),
  );
  expect(
    emptyCommands.every(
      command =>
        command.delta.upserted.length === 0 &&
        command.delta.deleted.length === 0,
    ),
  ).toBe(true);
  expect(readerCommands.at(-1)?.failure).toMatchObject({
    code: 'reservation-work-refused',
  });
  expect(emptyCommands.at(-1)?.failure).toMatchObject({
    code: 'reservation-work-refused',
  });
  expect(editorCommands.every(command => command.failure === null)).toBe(true);
  expect(
    readerCommands.every(
      command =>
        Object.keys(command).toSorted().join(',') ===
        'commandName,delta,dispositionChainHash,failure,id,serviceIndex',
    ),
  ).toBe(true);
  expect(
    await runInDurableObject(repo, ({ db }) =>
      db.select().from(resources).all(),
    ),
  ).toHaveLength(2);
  await runInDurableObject(repo, async instance => {
    expect(
      (
        await instance.getSnapshot({
          serviceSessionLock: lock,
          claims,
          sessionName: 'viewer',
          nodeId: 'node_capability',
        })
      ).result,
    ).toMatchObject({
      _tag: 'Success',
      success: {
        serviceIndex: 3,
        resolvedThrough: 3,
        resources: [{ id: 'rsv_selected' }],
      },
    });
  });
  await expect.poll(() => invalid.closeCode).toBe(4003);
  await runInDurableObject(chain, instance => {
    const connection = instance.getConnection('reader');
    if (connection === undefined) expect.fail('Expected a live recipient');
    vi.spyOn(connection, 'send').mockImplementationOnce(() => {
      throw new Error('Socket send unavailable');
    });
    vi.spyOn(connection, 'close').mockImplementationOnce(() => {
      throw new Error('Socket close unavailable');
    });
  });
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: [
          {
            serviceIndex: 4,
            dispositionChainHash: '4'.repeat(64),
            id: 'cmd_broadcast_cleanup',
            commandName: 'probeCapability',
            delta: { upserted: [], deleted: [] },
            commandResolution: null,
          },
        ],
      })
    ).result._tag,
  ).toBe('Success');
  await expect
    .poll(() => editor.frames.at(-1))
    .toMatchObject({ type: 'commands', commands: [{ serviceIndex: 4 }] });
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  const browserHistory: Pick<ServiceActorVersionChain, 'getBrowserCommands'> =
    chain;
  expect(
    (
      await browserHistory.getBrowserCommands({
        afterServiceIndex: 0,
        models: lock.models,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Success',
    success: {
      serviceIndex: 4,
      commands: [1, 2, 3, 4].map(serviceIndex => ({ serviceIndex })),
    },
  });
  expect(
    (
      await chain.getResolvedThrough({
        owner: {
          ...key,
          nodeId: 'node_capability',
          sessionName: 'viewer',
          claims,
        },
        afterOutcomeIndex: 0,
        throughServiceIndex: 4,
      })
    ).result,
  ).toMatchObject({ _tag: 'Success', success: 3 });
  expect(
    await runInDurableObject(chain, ({ db, schema }) => ({
      locks: db
        .select({ id: schema.connectionLocks.connectionId })
        .from(schema.connectionLocks)
        .orderBy(schema.connectionLocks.connectionId)
        .all(),
      public: db
        .select({ index: schema.exposedCommands.serviceIndex })
        .from(schema.exposedCommands)
        .all(),
      private: db
        .select({ index: schema.commandResolutions.serviceIndex })
        .from(schema.commandResolutions)
        .all(),
    })),
  ).toEqual({
    locks: [{ id: 'editor' }, { id: 'empty' }],
    public: [],
    private: [],
  });
});

it('withholds archived replay when retained connection authority disappears during an Archive read', async () => {
  expect(
    (
      await chain.appendExposedCommands({
        sourceKey: key,
        commands: [
          {
            serviceIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            id: 'cmd_disposed_archive_replay',
            commandName: 'probeCapability',
            delta: { upserted: [], deleted: [] },
            commandResolution: {
              nodeId: 'node_capability',
              pushIndex: 1,
              sessionName: 'viewer',
              claims,
              failure: null,
            },
          },
        ],
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(chain, instance =>
    Effect.runPromise(instance.archiveFanout.drain()),
  );
  const response = await chain.fetch(
    'https://actor/socket?_pk=archive_disposal',
    { headers },
  );
  const socket = response.webSocket;
  if (socket === null) {
    expect.fail('Expected an Actor WebSocket');
  }
  socket.accept();
  joined.push({ id: 'archive_disposal', socket, frames: [] });
  let entered = false;
  const release = Promise.withResolvers<void>();
  const summary = ServiceActorVersionArchive.prototype.getResolutionSummary;
  vi.spyOn(
    ServiceActorVersionArchive.prototype,
    'getResolutionSummary',
  ).mockImplementation(
    async function (this: ServiceActorVersionArchive, props) {
      entered = true;
      await release.promise;
      return summary.call(this, props);
    },
  );
  let commandFrames = 0;
  let completed = false;
  const onMessage = ServiceActorVersionChain.prototype.onMessage;
  vi.spyOn(ServiceActorVersionChain.prototype, 'onMessage').mockImplementation(
    function (this: ServiceActorVersionChain, ...args) {
      return onMessage.call(this, ...args).finally(() => {
        completed = true;
      });
    },
  );
  await runInDurableObject(chain, instance => {
    const connection =
      instance.getConnection<IServiceConnectionState>('archive_disposal');
    if (connection === undefined) {
      expect.fail('Expected the replay connection');
    }
    const send = connection.send.bind(connection);
    vi.spyOn(connection, 'send').mockImplementation(message => {
      if (JSON.parse(String(message)).type === 'commands') {
        commandFrames += 1;
      }
      send(message);
    });
  });
  socket.send(
    JSON.stringify({
      type: 'resume',
      nodeId: 'node_capability',
      outcomeIndex: 0,
      serviceIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    }),
  );
  await expect.poll(() => entered).toBe(true);
  try {
    await runInDurableObject(chain, instance => {
      const connection =
        instance.getConnection<IServiceConnectionState>('archive_disposal');
      if (connection === undefined) {
        expect.fail('Expected the paused connection');
      }
      instance.db
        .delete(instance.schema.connectionLocks)
        .where(eq(instance.schema.connectionLocks.connectionId, connection.id))
        .run();
      expect(
        instance.db.select().from(instance.schema.connectionLocks).all(),
      ).toEqual([]);
      expect(connection.state).not.toBeNull();
      expect(connection.readyState).toBe(1);
    });
  } finally {
    release.resolve();
  }
  await expect.poll(() => completed).toBe(true);
  expect(commandFrames).toBe(0);
});

it('preserves hibernating attachments, prunes absent admissions atomically, and disposes actual error and close paths', async () => {
  for (const id of ['awaiting', 'live', 'replaying']) {
    const response = await chain.fetch(`https://actor/socket?_pk=${id}`, {
      headers: {
        ...headers,
        'x-zerospin-producer': JSON.stringify(`node_${id}`),
      },
    });
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    const state: IJoinedSocket = { id, socket, frames: [] };
    socket.addEventListener('message', event => {
      state.frames.push(JSON.parse(String(event.data)));
    });
    socket.addEventListener('close', event => {
      state.closeCode = event.code;
    });
    socket.accept();
    joined.push(state);
    if (id === 'live') {
      socket.send(
        JSON.stringify({
          type: 'resume',
          nodeId: 'node_live',
          serviceIndex: 0,
          outcomeIndex: 0,
          dispositionChainHash: genesisDispositionChainHash(),
        }),
      );
      await expect
        .poll(() => state.frames.at(-1)?.type)
        .toBe('replay-complete');
    }
  }
  await runInDurableObject(chain, async instance => {
    const { db, schema } = instance;
    const replaying =
      instance.getConnection<IServiceConnectionState>('replaying');
    if (replaying === undefined || replaying.state === null) {
      expect.fail('Expected a retained connection');
    }
    replaying.setState({
      ...replaying.state,
      phase: 'replaying',
      nodeId: 'node_replaying',
    });
    db.insert(schema.connectionLocks)
      .values(
        ['orphan_one', 'orphan_two'].map(connectionId => ({
          connectionId,
          contractVersions: '{}',
          modelNames: '[]',
        })),
      )
      .run();
    const retained = db.select().from(schema.connectionLocks).all();
    const iterator = instance.getConnections();
    const prototype = Object.getPrototypeOf(iterator);
    const next = prototype.next;
    let enumerated = 0;
    const enumeration = vi
      .spyOn(prototype, 'next')
      .mockImplementation(function (this: Iterator<unknown>) {
        if (++enumerated === 2) {
          throw new Error('Socket enumeration interrupted');
        }
        return next.call(this);
      });
    try {
      expect(
        Exit.isFailure(
          await config.managedRuntime.runPromise(
            reconcileConnectionLocks(
              db,
              instance.getConnections.bind(instance),
            ).pipe(Effect.exit),
          ),
        ),
      ).toBe(true);
      expect(db.select().from(schema.connectionLocks).all()).toEqual(retained);
    } finally {
      enumeration.mockRestore();
    }
    db.run(
      sql`CREATE TRIGGER reject_pruning BEFORE DELETE ON connectionLocks WHEN OLD.connectionId = 'orphan_two' BEGIN SELECT RAISE(ABORT, 'connection-pruning-unavailable'); END`,
    );
    expect(
      Exit.isFailure(
        await config.managedRuntime.runPromise(
          reconcileConnectionLocks(
            db,
            instance.getConnections.bind(instance),
          ).pipe(Effect.exit),
        ),
      ),
    ).toBe(true);
    expect(db.select().from(schema.connectionLocks).all()).toEqual(retained);
    db.run(sql`DROP TRIGGER reject_pruning`);
  });
  await evictDurableObject(chain, { webSockets: 'hibernate' });
  expect(
    await runInDurableObject(chain, instance => ({
      ids: instance.db
        .select({ id: instance.schema.connectionLocks.connectionId })
        .from(instance.schema.connectionLocks)
        .orderBy(instance.schema.connectionLocks.connectionId)
        .all(),
      phases: Array.from(
        instance.getConnections<IServiceConnectionState>(),
        connection => connection.state?.phase,
      ).toSorted(),
      open: Array.from(
        instance.getConnections(),
        connection => connection.readyState,
      ).every(state => state === WebSocket.OPEN),
    })),
  ).toEqual({
    ids: [{ id: 'awaiting' }, { id: 'live' }, { id: 'replaying' }],
    phases: ['awaiting-resume', 'live', 'replaying'],
    open: true,
  });
  const [awaiting, live, replaying] = joined;
  if (awaiting === undefined || live === undefined || replaying === undefined) {
    expect.fail('Expected hibernated connections');
  }
  awaiting.socket.send(
    JSON.stringify({
      type: 'resume',
      nodeId: 'node_awaiting',
      serviceIndex: 0,
      outcomeIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    }),
  );
  await expect.poll(() => awaiting.frames.at(-1)?.type).toBe('replay-complete');
  await runInDurableObject(chain, async instance => {
    const connection = instance.getConnection<IServiceConnectionState>('live');
    if (connection === undefined) expect.fail('Expected a live connection');
    await instance.onError(connection, new Error('Socket transport failed'));
  });
  await expect.poll(() => live.closeCode).toBe(1011);
  replaying.socket.send('not json');
  await expect.poll(() => replaying.closeCode).toBe(4003);
  awaiting.socket.close();
  await expect
    .poll(() =>
      runInDurableObject(chain, ({ db, schema }) =>
        db.select().from(schema.connectionLocks).all(),
      ),
    )
    .toEqual([]);
  expect(
    await runInDurableObject(chain, ({ db, schema }) =>
      db.select().from(schema.exposedCommands).all(),
    ),
  ).toEqual([]);
});

it('compensates interrupted installation and attempts every teardown action on real connections', async () => {
  for (const mode of [
    'interrupted',
    'attachment',
    'teardown',
    'deletion',
  ] as const) {
    const response = await chain.fetch(`https://actor/socket?_pk=${mode}`, {
      headers,
    });
    const socket = response.webSocket;
    if (socket === null) expect.fail('Expected an actual Actor WebSocket');
    socket.accept();
    joined.push({ id: mode, socket, frames: [] });
    await runInDurableObject(chain, async instance => {
      const { db, schema } = instance;
      const connection = instance.getConnection<IServiceConnectionState>(mode);
      if (
        connection === undefined ||
        connection.state?.phase !== 'awaiting-resume'
      ) {
        expect.fail('Expected admitted connection state');
      }
      const admission = connection.state;
      if (mode === 'interrupted' || mode === 'attachment') {
        db.delete(schema.connectionLocks)
          .where(eq(schema.connectionLocks.connectionId, mode))
          .run();
        if (mode === 'interrupted') {
          const interrupted = await config.managedRuntime.runPromise(
            Effect.gen(function* () {
              const fiber = yield* Effect.withFiber(current => {
                const interruptingLock = { ...lock };
                Object.defineProperty(interruptingLock, 'contracts', {
                  get() {
                    current.interruptUnsafe();
                    return lock.contracts;
                  },
                });
                return installConnection({
                  db,
                  connection,
                  lock: interruptingLock,
                  admission,
                });
              }).pipe(Effect.forkChild);
              return yield* Fiber.await(fiber);
            }),
          );
          expect(Exit.isFailure(interrupted)).toBe(true);
        } else {
          const attachment = vi
            .spyOn(connection, 'setState')
            .mockImplementationOnce(() => {
              expect(
                db.select().from(schema.connectionLocks).all(),
              ).toHaveLength(1);
              throw new Error('Connection attachment unavailable');
            });
          try {
            expect(
              Exit.isFailure(
                await config.managedRuntime.runPromise(
                  installConnection({ db, connection, lock, admission }).pipe(
                    Effect.exit,
                  ),
                ),
              ),
            ).toBe(true);
          } finally {
            attachment.mockRestore();
          }
        }
        expect(connection.state).toBeNull();
      } else if (mode === 'teardown') {
        const fence = vi
          .spyOn(connection, 'setState')
          .mockImplementationOnce(() => {
            throw new Error('Fence unavailable');
          });
        const send = vi.spyOn(connection, 'send').mockImplementationOnce(() => {
          throw new Error('Send unavailable');
        });
        const close = vi
          .spyOn(connection, 'close')
          .mockImplementationOnce(() => {
            throw new Error('Close unavailable');
          });
        try {
          expect(() =>
            disposeConnection({
              db,
              connection,
              code: 4003,
              message: { type: 'state-required', reason: 'server-failure' },
            }),
          ).toThrow('Close unavailable');
          expect(fence).toHaveBeenCalledOnce();
          expect(send).toHaveBeenCalledOnce();
          expect(close).toHaveBeenCalledOnce();
          expect(db.select().from(schema.connectionLocks).all()).toEqual([]);
        } finally {
          fence.mockRestore();
          send.mockRestore();
          close.mockRestore();
        }
        disposeConnection({ db, connection, code: 4003 });
        disposeConnection({ db, connection, code: 4003 });
        expect(connection.state).toBeNull();
      } else {
        db.run(
          sql`CREATE TRIGGER reject_disposal BEFORE DELETE ON connectionLocks BEGIN SELECT RAISE(ABORT, 'connection-disposal-unavailable'); END`,
        );
        try {
          expect(() =>
            disposeConnection({ db, connection, code: 4003 }),
          ).toThrow();
          expect(connection.state).toBeNull();
          expect(db.select().from(schema.connectionLocks).all()).toHaveLength(
            1,
          );
        } finally {
          db.run(sql`DROP TRIGGER reject_disposal`);
        }
        disposeConnection({ db, connection, code: 4003 });
      }
      expect(db.select().from(schema.connectionLocks).all()).toEqual([]);
    });
  }
});
