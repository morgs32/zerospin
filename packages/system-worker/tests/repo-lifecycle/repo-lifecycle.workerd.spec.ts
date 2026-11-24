import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { makeServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/makeServiceAgentSessionLock';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { IRepoRegistration } from '@zerospin/core/system/types';
import { encodeError, makeZerospinError } from '@zerospin/error';
import { AggregateVersionRepo } from '@zerospin/owner-release-worker/VersionRepos';
import { primitives } from '@zerospin/shapes';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { DurableObject, env, exports } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schema from 'effect/Schema';
import { afterEach, expect, it, vi } from 'vitest';

import type { AggregateChain } from '../../src/AggregateChain/AggregateChain.ts';
import { aggregateVersionChainNameUtils } from '../../src/AggregateVersionChain/aggregateVersionChainName.ts';
import { aggregateVersionRepoNameUtils } from '../../src/AggregateVersionRepo/aggregateVersionRepoName.ts';
import { makeMigratableDORepo } from '../../src/makeMigratableDORepo/makeMigratableDORepo.ts';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../../src/runWorkerInvocation/runWorkerInvocation.ts';
import { ServiceActorVersionChain } from '../../src/ServiceActorVersionChain/ServiceActorVersionChain.ts';
import { serviceActorVersionChainNameUtils } from '../../src/ServiceActorVersionChain/serviceActorVersionChainName.ts';
import { ServiceChain } from '../../src/ServiceChain/ServiceChain.ts';
import { SystemApi } from '../../src/SystemApi/SystemApi.ts';
import { consumeSessionWebSocketTicket } from '../../src/SystemRepo/sessionWebSocketTickets/consumeSessionWebSocketTicket.ts';
import {
  sessionAdmissionFamily,
  SessionAdmissionSchema,
  type ISessionAdmission,
} from '../../src/SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.ts';
import {
  AGENT_INSTALLATION_STORAGE_KEY,
  ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY,
  ORDINARY_CONTINUATION_STORAGE_KEY,
  SystemRepo,
} from '../../src/SystemRepo/SystemRepo.ts';
import { systemRepoDbConfig } from '../../src/SystemRepo/systemRepoDbConfig.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';

import config, { system } from './system.ts';

it('prints complete escaping invocation failures without changing their values', async () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = { code: 'invocation-failed', detail: 'pending write failed' };
  await expect(
    config.managedRuntime.runPromise(runWorkerInvocation(Effect.fail(failure))),
  ).rejects.toBe(failure);
  expect(output).toHaveBeenCalledTimes(1);
  expect(output.mock.calls[0]?.[0]).toContain('[zerospin] runWorkerInvocation');
  expect(output.mock.calls[0]?.[0]).toContain('invocation-failed');
  expect(output.mock.calls[0]?.[0]).toContain('pending write failed');

  output.mockClear();
  expect(
    await config.managedRuntime.runPromise(
      runWorkerInvocation(Effect.succeed('ready')),
    ),
  ).toBe('ready');
  await config.managedRuntime.runPromiseExit(
    runWorkerInvocation(Effect.interrupt),
  );
  expect(output).not.toHaveBeenCalled();

  const cause = Cause.combine(Cause.fail(failure), Cause.interrupt());
  const exit = await config.managedRuntime.runPromiseExit(
    runWorkerInvocation(Effect.failCause(cause)),
  );
  expect(exit).toEqual(Exit.failCause(cause));
  expect(output).toHaveBeenCalledTimes(1);
  expect(output.mock.calls[0]?.[0]).toContain('invocation-failed');

  output.mockImplementation(() => {
    throw new Error('diagnostic sink unavailable');
  });
  await expect(
    config.managedRuntime.runPromise(runWorkerInvocation(Effect.fail(failure))),
  ).rejects.toBe(failure);
});

it('prints the final synchronous AggregateVersionRepo construction failure before rethrowing', async () => {
  const systemId = config.systemId;
  const systemRepo = env.SYSTEM_REPO.getByName(systemId);
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const chain = env.AGGREGATE_VERSION_CHAIN.getByName(
    Effect.runSync(
      aggregateVersionChainNameUtils.makeName({
        systemId,
        aggregateId: 'acc_construction',
        aggregateName: 'account',
        aggregateVersion: 1,
      }),
    ),
  );
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  await runInDurableObject(chain, (_chain, state) => {
    expect(() => new AggregateVersionRepo(state, env)).toThrow();
    expect(output.mock.calls.map(([message]) => message).join('\n')).toContain(
      '[zerospin] AGGREGATE_VERSION_REPO.initialize',
    );
    expect(output.mock.calls.map(([message]) => message).join('\n')).toContain(
      'sys_servicePublication',
    );

    output.mockClear();
    const SuspendedRepo = makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
      namespaceBinding: 'AGGREGATE_VERSION_REPO',
      managedRuntime: config.managedRuntime,
      runInvocation: runWorkerInvocation,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      migratableDORepoConfig: {
        nameUtils: {
          ...aggregateVersionRepoNameUtils,
          parseName: () =>
            Effect.never.pipe(
              Effect.ensuring(
                Effect.die(new Error('initialization cleanup failed')),
              ),
            ),
        },
        dbConfig: () => Effect.succeed(systemRepoDbConfig),
        bootstrap: null,
        migrations: [],
      },
    });
    expect(() => new SuspendedRepo(state, env)).toThrow();
    expect(output.mock.calls.map(([message]) => message).join('\n')).toContain(
      'initialization cleanup failed',
    );
  });
});

it('hands native Errors to the Durable Object activation gate', async () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = await Effect.runPromise(
    encodeError(
      makeZerospinError({
        code: 'activation-replay-failed',
        message: 'Missing down adapter for replayFixture',
      }),
    ),
  );
  const repo = exports.SystemRepo.getByName('sys_servicePublication');
  await runInDurableObject(repo, async (_repo, state) => {
    let startup: Promise<unknown> | undefined;
    vi.spyOn(state, 'blockConcurrencyWhile').mockImplementation(callback => {
      const pending = callback();
      void pending.catch(() => {});
      startup = pending;
      return pending;
    });
    vi.spyOn(SystemRepo.prototype, 'onRepoStartup').mockReturnValue(
      Effect.fail(failure),
    );
    new SystemRepo(state, env);

    await expect(startup).rejects.toBeInstanceOf(Error);
    await expect(startup).rejects.toThrow(failure.message);
  });
  expect(output.mock.calls.map(([message]) => message).join('\n')).toContain(
    failure.message,
  );
});

it('prints cleanup defects during actual fiber cancellation', async () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  await config.managedRuntime.runPromise(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        runWorkerInvocation(
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.die(new Error('interrupted cleanup failed')),
            ),
          ),
        ),
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
    }),
  );
  expect(output).toHaveBeenCalledTimes(1);
  expect(output.mock.calls[0]?.[0]).toContain('interrupted cleanup failed');
});

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: {
        SystemRepo: typeof SystemRepo;
        AggregateChain: typeof AggregateChain;
      };
      durableNamespaces: 'SystemRepo' | 'AggregateChain';
    }
  }
}

const aggregateViewer = system.aggregates.account.releases[1].actors.viewer;
const serviceOperator =
  system.services.reservations.releases[1].actors.operator;
const aggregateActorAdmission: Extract<
  ISessionAdmission,
  { kind: 'aggregateActor' }
> = {
  kind: 'aggregateActor',
  aggregateId: 'acc_ticket',
  aggregateName: 'account',
  aggregateVersion: 1,
  nodeId: null,
  actorPath: '/one',
  claims: { aggregateId: 'acc_ticket', viewerId: 'one' },
  aggregateSessionLock: Schema.decodeUnknownSync(
    SessionAdmissionSchema.members[0].fields.aggregateSessionLock,
  )(
    makeAggregateSessionLock({
      aggregateName: 'account',
      aggregateVersion: 1,
      actorName: 'viewer',
      actorVersion: 1,
      sessionName: 'viewer',
      claimsSchema: aggregateViewer.identity.claimsSchema,
      models: aggregateViewer.exposedModels,
      modelNames: Object.keys(aggregateViewer.exposedModels),
      contracts: aggregateViewer.contracts,
    }),
  ),
};
const aggregateAgentAdmission: Extract<
  ISessionAdmission,
  { kind: 'aggregateAgent' }
> = {
  kind: 'aggregateAgent',
  aggregateId: 'acc_ticket',
  aggregateName: 'agentAccount',
  aggregateVersion: 1,
  nodeId: 'node_aggregate_observer',
  aggregateSessionLock: Schema.decodeUnknownSync(
    SessionAdmissionSchema.members[1].fields.aggregateSessionLock,
  )(
    makeAggregateSessionLock(
      system.aggregateAgents.agentAccount.aggregateExpiry.releases[1],
    ),
  ),
};
const serviceActorAdmission: Extract<
  ISessionAdmission,
  { kind: 'serviceActor' }
> = {
  kind: 'serviceActor',
  serviceName: 'reservations',
  serviceVersion: 1,
  nodeId: null,
  actorPath: '/one',
  claims: { viewerId: 'one', department: 'tickets' },
  serviceSessionLock: makeServiceSessionLock({
    kind: 'service',
    serviceName: 'reservations',
    serviceVersion: 1,
    actorName: 'operator',
    actorVersion: 1,
    sessionName: 'operator',
    claimsSchema: serviceOperator.identity.claimsSchema,
    contracts: serviceOperator.contracts,
    models: serviceOperator.exposedModels,
    modelNames: Object.keys(serviceOperator.exposedModels),
  }),
};
const serviceAgentAdmission: Extract<
  ISessionAdmission,
  { kind: 'serviceAgent' }
> = {
  kind: 'serviceAgent',
  serviceName: 'agentReservations',
  serviceVersion: 1,
  nodeId: 'node_service_observer',
  serviceAgentSessionLock: makeServiceAgentSessionLock(
    system.serviceAgents.agentReservations.serviceExpiry.releases[1],
  ),
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

it('dispatches the native ServiceChain alarm once after schema and activation', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );

  const nativeEvents: string[] = [];
  const registerRepoMethod = SystemRepo.prototype.registerRepo;
  vi.spyOn(SystemRepo.prototype, 'registerRepo').mockImplementation(
    function (this: SystemRepo, props) {
      const { registration, systemSpecHash } = props;
      if (registration.repoName === 'sc_sys_servicePublication/dispatcher') {
        expect(systemSpecHash).toBe(spec.hash);
        expect(nativeEvents).toEqual([]);
      }
      return registerRepoMethod.call(this, { registration, systemSpecHash });
    },
  );
  const nativeActivation = ServiceChain.prototype.onRepoStartup;
  vi.spyOn(ServiceChain.prototype, 'onRepoStartup').mockImplementation(
    function (this: ServiceChain) {
      return Effect.sync(() => {
        expect(this.db.select().from(this.schema.commands).all()).toEqual([]);
        nativeEvents.push('activation');
      }).pipe(Effect.andThen(nativeActivation.call(this)));
    },
  );
  const nativeAlarm = ServiceChain.prototype.onAlarm;
  vi.spyOn(ServiceChain.prototype, 'onAlarm').mockImplementation(
    async function (this: ServiceChain) {
      expect(nativeEvents).toEqual(['activation']);
      nativeEvents.push('alarm');
      await nativeAlarm.call(this);
    },
  );
  const source = env.SERVICE_CHAIN.getByName(
    'sc_sys_servicePublication/dispatcher',
  );
  await runInDurableObject(source, (_, { storage }) =>
    storage.setAlarm(Date.now() + 60_000),
  );
  expect(nativeEvents).toEqual(['activation']);
  expect(await runDurableObjectAlarm(source)).toBe(true);
  expect((await source.awaitStartup()).result._tag).toBe('Success');
  expect(nativeEvents).toEqual(['activation', 'alarm']);

  expect(
    (await systemRepo.getRepoRegistrations({ repoType: 'ServiceChain' }))
      .result,
  ).toEqual({
    _tag: 'Success',
    success: expect.arrayContaining([
      {
        repoType: 'ServiceChain',
        repoName: 'sc_sys_servicePublication/dispatcher',
        tableNames: [
          'admissionPosition',
          'finalizedPosition',
          'agentNodeProducers',
          'nodeProducers',
          'commands',
          'recordedCommandAdmissions',
          'commandOperationOutbox',
          'externalOperationOutbox',
          'replaySubscribers',
          'agentCommandReceipts',
        ],
      },
    ]),
  });
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    const rows = db.select().from(schema.repos).all();
    expect(rows.some(row => row.repoType === 'SystemRepo')).toBe(false);
    expect(rows.some(row => row.repoType === 'SystemLogRepo')).toBe(false);
  });
});

it('dispatches the PartyServer Actor alarm once after schema and activation', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName(config.systemId);
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');

  const partyEvents: string[] = [];
  const partyActivation = ServiceActorVersionChain.prototype.onRepoStartup;
  vi.spyOn(
    ServiceActorVersionChain.prototype,
    'onRepoStartup',
  ).mockImplementation(function (this: ServiceActorVersionChain) {
    return Effect.sync(() => {
      expect(this.db.select().from(this.schema.connectionLocks).all()).toEqual(
        [],
      );
      partyEvents.push('activation');
    }).pipe(Effect.andThen(partyActivation.call(this)));
  });
  const partyStart = ServiceActorVersionChain.prototype.onStart;
  vi.spyOn(ServiceActorVersionChain.prototype, 'onStart').mockImplementation(
    function (this: ServiceActorVersionChain, props) {
      expect(partyEvents).toEqual(['activation']);
      partyEvents.push('start');
      return partyStart.call(this, props);
    },
  );
  const partyAlarm = ServiceActorVersionChain.prototype.onAlarm;
  vi.spyOn(ServiceActorVersionChain.prototype, 'onAlarm').mockImplementation(
    async function (this: ServiceActorVersionChain) {
      expect(partyEvents).toEqual(['activation', 'start']);
      partyEvents.push('alarm');
      await partyAlarm.call(this);
    },
  );
  const chainName = Effect.runSync(
    serviceActorVersionChainNameUtils.makeName({
      systemId: 'sys_servicePublication',
      serviceName: 'reservations',
      serviceVersion: 1,
      actorName: 'operator',
      actorVersion: 1,
      actorPath: '/lifecycle',
    }),
  );
  const chain = env.SERVICE_ACTOR_VERSION_CHAIN.getByName(chainName);
  await runInDurableObject(chain, (_, { storage }) =>
    storage.setAlarm(Date.now() + 60_000),
  );
  expect(partyEvents).toEqual(['activation']);
  expect(await runDurableObjectAlarm(chain)).toBe(true);
  expect((await chain.awaitStartup()).result._tag).toBe('Success');
  expect(partyEvents).toEqual(['activation', 'start', 'alarm']);

  expect(
    (
      await systemRepo.getRepoRegistrations({
        repoType: 'ServiceActorVersionChain',
      })
    ).result,
  ).toEqual({
    _tag: 'Success',
    success: expect.arrayContaining([
      {
        repoType: 'ServiceActorVersionChain',
        repoName: chainName,
        tableNames: [
          'historyHead',
          'archives',
          'archiveFanoutSubscribers',
          'exposedCommands',
          'commandResolutions',
          'connectionLocks',
        ],
      },
    ]),
  });
});

it('refuses a pre-adoption catalog before accepting a SystemSpec even with no AVC registrations', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const systemId = 'sys_servicePublication';
  const api = new SystemApi(systemId);
  const repo = exports.SystemRepo.getByName(systemId);
  const request: Parameters<SystemApi['acceptSystemSpec']>[0] = {
    args: [],
    traceContext: null,
  };
  expect((await api.acceptSystemSpec(request)).result._tag).toBe('Success');

  await runInDurableObject(repo, (_repo, state) => {
    const { storage } = state;
    expect(storage.sql.exec('SELECT * FROM repos').toArray()).toEqual([]);
    const catalog = storage.sql
      .exec('SELECT * FROM acceptedSystemSpecs')
      .toArray();
    const ledger = storage.sql
      .exec('SELECT * FROM applied_migrations')
      .toArray();
    storage.kv.delete(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY);

    expect(() => new SystemRepo(state, env)).toThrow(
      'aggregate-history-storage-incompatible',
    );
    expect(
      storage.sql.exec('SELECT * FROM acceptedSystemSpecs').toArray(),
    ).toEqual(catalog);
    expect(
      storage.sql.exec('SELECT * FROM applied_migrations').toArray(),
    ).toEqual(ledger);
    expect(
      storage.kv.get(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY),
    ).toBeUndefined();
  });

  await evictDurableObject(repo);
  expect((await api.acceptSystemSpec(request)).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-history-storage-incompatible' },
  });
});

it('accepts a retained catalog without Agents before establishing the Agent storage format', async () => {
  const repo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({
    system: makeSystem({
      name: system.name,
      aggregates: system.aggregates,
      services: system.services,
    }),
  });
  expect((await repo.registerSystemSpec({ spec })).result._tag).toBe('Success');
  await runInDurableObject(repo, (_repo, { storage }) => {
    storage.kv.delete(AGENT_INSTALLATION_STORAGE_KEY);
  });
  await evictDurableObject(repo);

  expect(await repo.hasVersionBoundAgentInstallationStorage()).toBe(true);
});

it('rejects the prior Agent format before changing retained catalog or ledger rows', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const repo = exports.SystemRepo.getByName('sys_servicePublication');
  expect(
    (await repo.registerSystemSpec({ spec: makeSystemSpec({ system }) })).result
      ._tag,
  ).toBe('Success');
  await runInDurableObject(repo, (_repo, state) => {
    const { storage } = state;
    const catalog = storage.sql
      .exec('SELECT * FROM acceptedSystemSpecs')
      .toArray();
    const ledger = storage.sql
      .exec('SELECT * FROM applied_migrations')
      .toArray();
    // The prior format included an executable digest in each installation binding.
    storage.kv.put('agent-release-scoped-selected-row-wake-storage', true);
    storage.kv.delete(AGENT_INSTALLATION_STORAGE_KEY);
    expect(() => new SystemRepo(state, env)).toThrow(
      'agent-wake-storage-incompatible',
    );
    expect(
      storage.sql.exec('SELECT * FROM acceptedSystemSpecs').toArray(),
    ).toEqual(catalog);
    expect(
      storage.sql.exec('SELECT * FROM applied_migrations').toArray(),
    ).toEqual(ledger);
    expect(storage.kv.get(AGENT_INSTALLATION_STORAGE_KEY)).toBeUndefined();
  });
  await evictDurableObject(repo);
  const api = new SystemApi('sys_servicePublication');
  expect(
    (await api.acceptSystemSpec({ args: [], traceContext: null })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'agent-wake-storage-incompatible' },
  });
});

it('rejects the former continuation layout before changing the catalog or ledger', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const systemId = 'sys_servicePublication';
  const api = new SystemApi(systemId);
  const repo = exports.SystemRepo.getByName(systemId);
  const request: Parameters<SystemApi['acceptSystemSpec']>[0] = {
    args: [],
    traceContext: null,
  };
  expect((await api.acceptSystemSpec(request)).result._tag).toBe('Success');

  await runInDurableObject(repo, (_repo, state) => {
    const { storage } = state;
    const catalog = storage.sql
      .exec('SELECT * FROM acceptedSystemSpecs')
      .toArray();
    const ledger = storage.sql
      .exec('SELECT * FROM applied_migrations')
      .toArray();
    storage.kv.delete(ORDINARY_CONTINUATION_STORAGE_KEY);
    storage.kv.put('command-continuation-source', true);

    expect(() => new SystemRepo(state, env)).toThrow(
      'recorded-command-storage-reset-required',
    );
    expect(
      storage.sql.exec('SELECT * FROM acceptedSystemSpecs').toArray(),
    ).toEqual(catalog);
    expect(
      storage.sql.exec('SELECT * FROM applied_migrations').toArray(),
    ).toEqual(ledger);
    expect(storage.kv.get(ORDINARY_CONTINUATION_STORAGE_KEY)).toBeUndefined();
  });

  expect((await api.acceptSystemSpec(request)).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'recorded-command-storage-reset-required' },
  });
  await evictDurableObject(repo);
  expect((await api.acceptSystemSpec(request)).result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'recorded-command-storage-reset-required' },
  });
});

it.each([
  'declaration',
  'invalid content',
  'invalid hash',
  'owner-row Agent selections',
  'legacy Aggregate canonical selection',
] as const)(
  'rejects a retained SystemSpec with %s before SystemRepo writes storage',
  async conflict => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const systemId = 'sys_servicePublication';
    const repo = exports.SystemRepo.getByName(systemId);
    const candidate = makeSystemSpec({ system });
    const owner = candidate.services.reservations!;
    const contract = owner.contractVersions.createReservation![1]!;
    const baselineBody =
      conflict === 'declaration'
        ? {
            ...candidate,
            services: {
              ...candidate.services,
              reservations: {
                ...owner,
                contractVersions: {
                  ...owner.contractVersions,
                  createReservation: {
                    ...owner.contractVersions.createReservation,
                    1: { ...contract, resultJsonSchema: { type: 'string' } },
                  },
                },
              },
            },
          }
        : candidate;
    const retainedBody =
      conflict === 'owner-row Agent selections'
        ? JSON.parse(
            JSON.stringify(baselineBody, (key, value) =>
              key === 'selectionSemantics' ? 'owner-rows' : value,
            ),
          )
        : conflict === 'legacy Aggregate canonical selection'
          ? {
              ...baselineBody,
              aggregates: {
                ...baselineBody.aggregates,
                account: { ...baselineBody.aggregates.account, canonical: 1 },
              },
            }
          : baselineBody;
    const baseline = { ...retainedBody, hash: hashSystemSpec(retainedBody) };
    if (conflict === 'owner-row Agent selections') {
      expect(
        candidate.aggregates.agentAccount?.agentVersions.aggregateExpiry?.[1]
          ?.selectionSemantics,
      ).toBe('selected-rows');
      expect(baseline.hash).not.toBe(candidate.hash);
    }
    const hash = conflict === 'invalid hash' ? 'a'.repeat(64) : baseline.hash;
    const raw =
      conflict === 'invalid content' ? '{}' : JSON.stringify(baseline);
    const code =
      conflict === 'declaration'
        ? 'system-spec-version-mismatch'
        : 'system-spec-invalid';

    await runInDurableObject(repo, (_repo, state) => {
      const { storage } = state;
      storage.sql.exec(
        'INSERT INTO acceptedSystemSpecs (hash, spec, ownerReleases) VALUES (?, ?, ?)',
        hash,
        raw,
        '[]',
      );
      const catalog = storage.sql
        .exec('SELECT * FROM acceptedSystemSpecs')
        .toArray();
      const ledger = storage.sql
        .exec('SELECT * FROM applied_migrations')
        .toArray();
      const registrations = storage.sql.exec('SELECT * FROM repos').toArray();
      expect(() => new SystemRepo(state, env)).toThrow(code);
      expect(
        storage.sql.exec('SELECT * FROM acceptedSystemSpecs').toArray(),
      ).toEqual(catalog);
      expect(
        storage.sql.exec('SELECT * FROM applied_migrations').toArray(),
      ).toEqual(ledger);
      expect(storage.sql.exec('SELECT * FROM repos').toArray()).toEqual(
        registrations,
      );
    });

    await evictDurableObject(repo);
    const api = new SystemApi(systemId);
    expect(
      (await api.acceptSystemSpec({ args: [], traceContext: null })).result,
    ).toMatchObject({ _tag: 'Failure', failure: { code } });
  },
);

it('attests the serving runtime for the authenticated System and rejects a different ID', async () => {
  const api = new SystemApi(config.systemId);
  const systemSpec = makeSystemSpec({ system });
  expect(
    (
      await api.preflightDeployment({
        args: [{ systemId: config.systemId, systemSpec }],
        traceContext: null,
      })
    ).result,
  ).toEqual({
    _tag: 'Success',
    success: {
      versionId: env.ZEROSPIN_VERSION_METADATA?.id ?? null,
      bootstrap: false,
      acceptedOwnerReleases: [],
    },
  });
  expect(
    (
      await api.preflightDeployment({
        args: [{ systemId: 'sys_other', systemSpec }],
        traceContext: null,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'zerospin-deployment-system-identity-mismatch' },
  });
});

it('rejects mutation when a deployment request reaches an unexpected Worker version', async () => {
  const api = new SystemApi(config.systemId);
  const request = {
    args: [{ expectedVersionId: 'different-version' }],
    traceContext: null,
  } satisfies Parameters<SystemApi['acceptSystemSpec']>[0];
  const mismatch = {
    _tag: 'Failure',
    failure: { code: 'zerospin-deployment-worker-version-mismatch' },
  };
  expect((await api.acceptSystemSpec(request)).result).toMatchObject(mismatch);
  expect((await api.initialize(request)).result).toMatchObject(mismatch);

  const repo = exports.SystemRepo.getByName(config.systemId);
  expect((await repo.initialize('different-version')).result).toMatchObject(
    mismatch,
  );
});

it('inspects a fresh bootstrap without provisioning it before acceptance', async () => {
  const repo = exports.SystemRepo.getByName(config.systemId);
  const spec = makeSystemSpec({ system });
  await runInDurableObject(repo, async (_incumbent, state) => {
    const { storage } = state;
    await storage.deleteAll();
    const bootstrap = new SystemRepo(state, {
      ...env,
      ZEROSPIN_DEPLOYMENT_BOOTSTRAP: true,
    });

    expect((await bootstrap.preflightDeployment(spec)).result._tag).toBe(
      'Success',
    );
    expect(
      storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE name IN ('acceptedSystemSpecs', 'applied_migrations', 'repos')",
        )
        .toArray(),
    ).toEqual([]);
    expect(await storage.list()).toEqual(new Map());

    expect((await bootstrap.registerSystemSpec({ spec })).result._tag).toBe(
      'Success',
    );
    const catalog = storage.sql
      .exec('SELECT hash FROM acceptedSystemSpecs')
      .toArray();
    expect(catalog).toEqual([{ hash: spec.hash }]);
    expect((await bootstrap.preflightDeployment(spec)).result._tag).toBe(
      'Success',
    );
    expect(
      storage.sql.exec('SELECT hash FROM acceptedSystemSpecs').toArray(),
    ).toEqual(catalog);
  });
});

it('rejects a retained 901 Actor RAW selection during serving preflight without writes', async () => {
  const repo = exports.SystemRepo.getByName('sys_servicePublication');
  const candidate = JSON.parse(JSON.stringify(makeSystemSpec({ system })));
  const db = makeQueryDbVersion({ models: { reservation: reservationV1 } });
  const definition = db.query.reservation
    .findMany({
      where: { RAW: row => sql`${row.id} IS NOT NULL` },
    })
    .captureOwnSource().definition;
  candidate.services.reservations.actorVersions.operator[1].selections.reservation.definition =
    definition;
  candidate.hash = hashSystemSpec(candidate);
  const retained = JSON.parse(JSON.stringify(candidate));
  retained.services.reservations.actorVersions.operator[1].selections.reservation.definition =
    JSON.parse(
      JSON.stringify(definition, (_key, part) => {
        if (!Array.isArray(part)) return part;
        if (part[0] === 'sql-selection-v2') return part[1];
        if (part[0] === 'scoped-column') return ['column', part[2], part[3]];
        if (part[0] === 'scoped-table') return ['table', part[2]];
        return part;
      }),
    );
  retained.hash = hashSystemSpec(retained);
  expect(retained.hash).not.toBe(candidate.hash);

  await runInDurableObject(repo, async (systemRepo, { storage }) => {
    storage.sql.exec(
      'INSERT INTO acceptedSystemSpecs (hash, spec, ownerReleases) VALUES (?, ?, ?)',
      retained.hash,
      JSON.stringify(retained),
      '[]',
    );
    const catalog = storage.sql
      .exec('SELECT * FROM acceptedSystemSpecs')
      .toArray();
    const ledger = storage.sql
      .exec('SELECT * FROM applied_migrations')
      .toArray();
    const registrations = storage.sql.exec('SELECT * FROM repos').toArray();
    expect(
      (await systemRepo.preflightDeployment(candidate)).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'system-spec-version-mismatch' },
    });
    expect(
      storage.sql.exec('SELECT * FROM acceptedSystemSpecs').toArray(),
    ).toEqual(catalog);
    expect(
      storage.sql.exec('SELECT * FROM applied_migrations').toArray(),
    ).toEqual(ledger);
    expect(storage.sql.exec('SELECT * FROM repos').toArray()).toEqual(
      registrations,
    );
  });
});

it('publishes a compatible Service build and preserves started execution across eviction', async () => {
  const repo = exports.SystemRepo.getByName(config.systemId);
  const spec = makeSystemSpec({ system });
  const release = { serviceName: 'dispatcher', serviceVersion: 1 };
  const first = {
    ...release,
    specHash: spec.hash,
    buildId: 'build-1',
    previousBuildId: null,
  };
  const second = { ...first, buildId: 'build-2', previousBuildId: 'build-1' };
  const alice = { ...release, serviceIndex: 1 };
  const bob = { ...release, serviceIndex: 2 };

  expect((await repo.acceptServiceBuild(first)).result._tag).toBe('Failure');
  expect((await repo.registerSystemSpec({ spec })).result._tag).toBe('Success');
  expect(
    (await repo.acceptServiceBuild({ ...first, serviceName: 'reservations' }))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-build-external-operations-unsupported' },
  });
  expect(
    (
      await repo.readAcceptedServiceBuild({
        serviceName: 'reservations',
        serviceVersion: 1,
      })
    ).result,
  ).toEqual({ _tag: 'Success', success: null });
  expect(
    (await repo.acceptServiceBuild({ ...first, serviceName: 'unknown' })).result
      ._tag,
  ).toBe('Failure');
  expect((await repo.readAcceptedServiceBuild(release)).result).toEqual({
    _tag: 'Success',
    success: null,
  });
  expect((await repo.acceptServiceBuild(first)).result).toEqual({
    _tag: 'Success',
    success: 'build-1',
  });
  expect((await repo.startServiceExecution(alice)).result).toEqual({
    _tag: 'Success',
    success: 'build-1',
  });
  expect((await repo.getServiceExecutionBuild(bob)).result).toEqual({
    _tag: 'Success',
    success: null,
  });

  expect((await repo.acceptServiceBuild(second)).result).toEqual({
    _tag: 'Success',
    success: 'build-2',
  });
  await evictDurableObject(repo);
  expect((await repo.acceptServiceBuild(second)).result).toEqual({
    _tag: 'Success',
    success: 'build-2',
  });
  expect(
    (await repo.acceptServiceBuild({ ...second, buildId: 'stale' })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'service-build-acceptance-conflict' },
  });
  expect((await repo.readAcceptedServiceBuild(release)).result).toEqual({
    _tag: 'Success',
    success: 'build-2',
  });
  expect((await repo.startServiceExecution(alice)).result).toEqual({
    _tag: 'Success',
    success: 'build-1',
  });
  expect((await repo.getServiceExecutionBuild(alice)).result).toEqual({
    _tag: 'Success',
    success: 'build-1',
  });
  expect(
    (await repo.startServiceExecution({ ...alice, serviceVersion: 2 })).result
      ._tag,
  ).toBe('Failure');
  expect(
    (await repo.getServiceExecutionBuild({ ...alice, serviceVersion: 2 }))
      .result._tag,
  ).toBe('Failure');
  expect((await repo.startServiceExecution(bob)).result).toEqual({
    _tag: 'Success',
    success: 'build-2',
  });
});

it('freezes exact owner Worker pins at SystemSpec acceptance', async () => {
  const spec = makeSystemSpec({ system });
  const repo = exports.SystemRepo.getByName(config.systemId);
  const pin = {
    systemId: config.systemId,
    release: { serviceName: 'reservations', serviceVersion: 1 },
    specHash: spec.hash,
    versionId: 'accepted-worker-version',
  };
  expect(
    (await repo.registerSystemSpec({ spec, ownerReleases: [pin] })).result._tag,
  ).toBe('Success');
  await evictDurableObject(repo);
  expect((await repo.preflightDeployment(spec)).result).toEqual({
    _tag: 'Success',
    success: [pin],
  });
  expect(
    (
      await repo.registerSystemSpec({
        spec,
        ownerReleases: [{ ...pin, versionId: 'replacement-worker-version' }],
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'zerospin-owner-release-pin-conflict' },
  });
  expect((await repo.preflightDeployment(spec)).result).toEqual({
    _tag: 'Success',
    success: [pin],
  });
});

it('retains complete SystemSpecs and reaccepts an equal hash without writes', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  await runInDurableObject(systemRepo, ({ db, schema }, { storage }) => {
    const rows = db.select().from(schema.acceptedSystemSpecs).all();
    expect(rows).toHaveLength(1);
    expect(
      Effect.runSync(
        systemRepoDbConfig.tables.acceptedSystemSpecs.decodeRow(rows[0]),
      ),
    ).toEqual({ hash: spec.hash, spec, ownerReleases: [] });
    expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
    storage.sql
      .exec(`CREATE TRIGGER spec_no_insert BEFORE INSERT ON acceptedSystemSpecs BEGIN
      SELECT RAISE(ABORT, 'equal acceptance inserted a snapshot'); END`);
    storage.sql
      .exec(`CREATE TRIGGER spec_no_update BEFORE UPDATE ON acceptedSystemSpecs BEGIN
      SELECT RAISE(ABORT, 'equal acceptance updated a snapshot'); END`);
    storage.sql
      .exec(`CREATE TRIGGER spec_no_delete BEFORE DELETE ON acceptedSystemSpecs BEGIN
      SELECT RAISE(ABORT, 'equal acceptance deleted a snapshot'); END`);
  });
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  await runInDurableObject(systemRepo, (_, { storage }) => {
    storage.sql.exec('DROP TRIGGER spec_no_insert');
    storage.sql.exec('DROP TRIGGER spec_no_update');
    storage.sql.exec('DROP TRIGGER spec_no_delete');
  });
  const omitted = makeSystemSpec({
    system: makeSystem({ name: system.name, aggregates: {} }),
  });
  expect(
    (await systemRepo.registerSystemSpec({ spec: omitted })).result._tag,
  ).toBe('Success');
  await evictDurableObject(systemRepo);
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  expect((await systemRepo.getAcceptedSystemSpec()).result).toEqual({
    _tag: 'Success',
    success: omitted,
  });
  expect((await systemRepo.getAcceptedSystemSpec(spec.hash)).result).toEqual({
    _tag: 'Success',
    success: spec,
  });
  expect(
    (
      await systemRepo.getAcceptedSystemSpec({
        serviceName: 'reservations',
        serviceVersion: 1,
      })
    ).result,
  ).toEqual({ _tag: 'Success', success: spec });
  // A newer accepted snapshot does not revoke code using the earlier one.
  expect(
    (
      await env.SERVICE_CHAIN.getByName(
        'sc_sys_servicePublication/dispatcher',
      ).awaitStartup()
    ).result._tag,
  ).toBe('Success');
  await evictDurableObject(systemRepo);
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(
      db
        .select()
        .from(schema.acceptedSystemSpecs)
        .all()
        .map(row => row.hash)
        .toSorted(),
    ).toEqual([spec.hash, omitted.hash].toSorted());
  });
});

it('accepts and rereads normalized metadata whose repeated Actor bodies would exceed four MiB', async () => {
  const largeText = Schema.String.annotate({
    description: 'metadata'.repeat(16_384),
  });
  const note = makeModelVersion(
    defineModel({ name: 'largeNote', abbreviation: 'lnote' }),
    {
      version: 1,
      attributes: { body: primitives.json({ schema: largeText }) },
      indexes: [],
    },
  );
  const queries = makeQueryDbVersion({ models: { largeNote: note } });
  const viewer = makeServiceActorRelease(
    { name: 'viewer' },
    {
      version: 1,
      db: queries,
      exposedModels: { largeNote: note },
      identity: makeActorIdentity({
        claims: Schema.Struct({ viewerId: largeText }),
        actorPath: RoutePattern.parse('/:viewerId'),
      }),
      authentication: 'none',
      selections: { largeNote: queries.query.largeNote.findMany({}) },
    },
  );
  const definition = { name: 'largeDeclarations' } as const;
  const models = { largeNote: note };
  const actors = { viewer };
  const first = makeServiceRelease(definition, { version: 1, models, actors });
  const child = (version: number) =>
    makeServiceRelease(definition, {
      version,
      models,
      actors,
      rebuildFrom: first,
    });
  const releases: Record<number, typeof first | ReturnType<typeof child>> = {
    1: first,
  };
  for (let version = 2; version <= 24; version++) {
    releases[version] = child(version);
  }
  const authored = makeSystem({
    name: system.name,
    aggregates: {},
    services: { largeDeclarations: { releases } },
  });
  const spec = makeSystemSpec({ system: authored });
  const owner = spec.services.largeDeclarations;
  if (owner === undefined) throw new Error('Expected large owner metadata');
  const actor = owner.actorVersions.viewer?.[1];
  if (actor === undefined) {
    throw new Error('Expected normalized Actor metadata');
  }
  expect(
    new TextEncoder().encode(JSON.stringify(actor)).byteLength * 24,
  ).toBeGreaterThan(4 * 1024 * 1024);
  expect(
    new TextEncoder().encode(JSON.stringify(spec)).byteLength,
  ).toBeLessThan(1024 * 1024);
  expect(Object.keys(owner.modelVersions.largeNote ?? {})).toEqual(['1']);
  expect(Object.keys(owner.actorVersions.viewer ?? {})).toEqual(['1']);
  expect(owner.releases[24]?.models.largeNote).toBe(1);
  expect(owner.releases[24]?.actors.viewer).toBe(1);
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  await evictDurableObject(systemRepo);
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    const row = db.select().from(schema.acceptedSystemSpecs).get();
    const accepted = Effect.runSync(
      systemRepoDbConfig.tables.acceptedSystemSpecs.decodeRow(row),
    );
    expect(accepted).toEqual({ hash: spec.hash, spec, ownerReleases: [] });
    expect(hashSystemSpec(accepted.spec)).toBe(spec.hash);
  });
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
});

it('registers independent Agents and rejects an unavailable owner binding', () => {
  const registry = system.aggregateAgents.agentAccount.aggregateExpiry;
  expect(registry.releases[1].aggregateVersion).toBe(1);
  expect(system.aggregates.agentAccount.releases[1]).not.toHaveProperty(
    'agents',
  );
  expect(() =>
    makeSystem({
      ...system,
      // @ts-expect-error An Agent cannot register beneath a different Aggregate.
      aggregateAgents: { anotherAccount: { aggregateExpiry: registry } },
    }),
  ).toThrow('exact registered owner release');
});

it('locks Agent versions while allowing replacement independently of the owner', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  const bundle = spec.aggregates.agentAccount;
  const owner = bundle?.releases[1];
  const first = bundle?.agentVersions.aggregateExpiry?.[1];
  if (bundle === undefined || owner === undefined || first === undefined) {
    throw new Error('Expected independent Agent declarations');
  }
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  const second = { ...first, agentVersion: 2, sessionName: 'expiry-v2' };
  const upgradedBody = {
    ...spec,
    aggregates: {
      ...spec.aggregates,
      agentAccount: {
        ...bundle,
        releases: { 1: owner },
        agentVersions: {
          ...bundle.agentVersions,
          aggregateExpiry: {
            ...bundle.agentVersions.aggregateExpiry,
            2: second,
          },
        },
      },
    },
    aggregateAgents: {
      agentAccount: {
        aggregateExpiry: { aggregateVersion: 1, agentVersion: 2 },
      },
    },
  };
  const upgraded = { ...upgradedBody, hash: hashSystemSpec(upgradedBody) };
  expect(
    (await systemRepo.registerSystemSpec({ spec: upgraded })).result._tag,
  ).toBe('Success');
  const repinnedBody = {
    ...upgraded,
    aggregateAgents: spec.aggregateAgents,
  };
  const repinned = { ...repinnedBody, hash: hashSystemSpec(repinnedBody) };
  expect(
    (await systemRepo.registerSystemSpec({ spec: repinned })).result._tag,
  ).toBe('Success');
  const conflictingBody = {
    ...upgraded,
    aggregates: {
      ...upgraded.aggregates,
      agentAccount: {
        ...bundle,
        agentVersions: {
          ...upgraded.aggregates.agentAccount.agentVersions,
          aggregateExpiry: {
            ...upgraded.aggregates.agentAccount.agentVersions.aggregateExpiry,
            2: { ...second, sessionName: 'changed' },
          },
        },
        releases: { 1: owner },
      },
    },
    aggregateAgents: {},
  };
  const conflict = {
    ...conflictingBody,
    hash: hashSystemSpec(conflictingBody),
  };
  expect(
    (await systemRepo.registerSystemSpec({ spec: conflict })).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'system-spec-version-mismatch' },
  });
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: {
          ...upgraded,
          aggregateAgents: {
            agentAccount: {
              aggregateExpiry: { aggregateVersion: 99, agentVersion: 2 },
            },
          },
        },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'system-spec-invalid' },
  });
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(db.select().from(schema.acceptedSystemSpecs).all()).toHaveLength(3);
  });
});

it('rejects malformed metadata and mismatching content hashes without accepting a snapshot', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  const owner = spec.services.reservations;
  const service = owner?.releases[1];
  if (owner === undefined || service === undefined) {
    throw new Error('Expected Service release');
  }
  for (const queries of [{}, { retiredQuery: {} }]) {
    const input = {
      ...spec,
      services: {
        reservations: { ...owner, releases: { 1: { ...service, queries } } },
      },
    };
    expect(
      (await systemRepo.registerSystemSpec({ spec: input })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'system-spec-invalid' },
    });
  }
  for (const release of [
    { ...service, models: { ...service.models, reservation: 99 } },
    { ...service, actors: { ...service.actors, operator: 99 } },
  ]) {
    const body = {
      ...spec,
      services: {
        ...spec.services,
        reservations: { ...owner, releases: { 1: release } },
      },
    };
    expect(
      (
        await systemRepo.registerSystemSpec({
          spec: { ...body, hash: hashSystemSpec(body) },
        })
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'system-spec-invalid' },
    });
  }
  expect(
    (
      await systemRepo.registerSystemSpec({
        spec: { ...spec, systemName: 'changed' },
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'system-spec-hash-mismatch' },
  });
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(db.select().from(schema.acceptedSystemSpecs).all()).toEqual([]);
  });
});

it('compares historical model, contract, Actor and release-binding facts against every retained snapshot atomically', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  const owner = spec.services.reservations;
  const service = owner?.releases[1];
  const actorVersion = service?.actors.operator;
  const actor =
    actorVersion === undefined
      ? undefined
      : owner?.actorVersions.operator?.[actorVersion];
  const modelVersion = service?.models.reservation;
  const model =
    modelVersion === undefined
      ? undefined
      : owner?.modelVersions.reservation?.[modelVersion];
  const contract = owner?.contractVersions.createReservation?.[1];
  if (
    owner === undefined ||
    service === undefined ||
    actor === undefined ||
    model === undefined ||
    actorVersion === undefined ||
    modelVersion === undefined ||
    contract === undefined
  ) {
    throw new Error('Expected Service, contract and Actor metadata');
  }
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  const omitted = makeSystemSpec({
    system: makeSystem({ name: system.name, aggregates: {} }),
  });
  expect(
    (await systemRepo.registerSystemSpec({ spec: omitted })).result._tag,
  ).toBe('Success');
  const changedContractBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        releases: { 3: { ...service, version: 3 } },
        contractVersions: {
          ...owner.contractVersions,
          createReservation: {
            ...owner.contractVersions.createReservation,
            1: { ...contract, resultJsonSchema: { type: 'string' } },
          },
        },
      },
    },
  };
  const changedActorBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        releases: { 3: { ...service, version: 3 } },
        actorVersions: {
          ...owner.actorVersions,
          operator: {
            ...owner.actorVersions.operator,
            [actorVersion]: {
              ...actor,
              identity: { ...actor.identity, pattern: '/changed/:viewerId' },
            },
          },
        },
      },
    },
  };
  const changedModelBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        releases: { 3: { ...service, version: 3, actors: {} } },
        modelVersions: {
          ...owner.modelVersions,
          reservation: {
            ...owner.modelVersions.reservation,
            [modelVersion]: {
              ...model,
              indexes: [
                ...model.indexes,
                { name: 'changed_reservation_id', columns: ['id'] },
              ],
            },
          },
        },
      },
    },
  };
  const changedActorBindingBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        actorVersions: {
          ...owner.actorVersions,
          operator: {
            ...owner.actorVersions.operator,
            3: { ...actor, version: 3 },
          },
        },
        releases: {
          1: { ...service, actors: { ...service.actors, operator: 3 } },
        },
      },
    },
  };
  const { createReservation: _createSystemGrant, ...remainingSystemGrants } =
    service.system;
  const changedGrantBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        releases: { 1: { ...service, system: remainingSystemGrants } },
      },
    },
  };
  for (const body of [
    changedContractBody,
    changedActorBody,
    changedModelBody,
    changedActorBindingBody,
    changedGrantBody,
  ]) {
    const candidate = { ...body, hash: hashSystemSpec(body) };
    expect(
      (await systemRepo.registerSystemSpec({ spec: candidate })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'system-spec-version-mismatch' },
    });
  }
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(
      db
        .select()
        .from(schema.acceptedSystemSpecs)
        .all()
        .map(row => row.hash)
        .toSorted(),
    ).toEqual([spec.hash, omitted.hash].toSorted());
  });
  const nextBody = {
    ...spec,
    services: {
      ...spec.services,
      reservations: {
        ...owner,
        releases: {
          3: { ...service, version: 3, system: remainingSystemGrants },
        },
      },
    },
  };
  const next = { ...nextBody, hash: hashSystemSpec(nextBody) };
  expect(
    (await systemRepo.registerSystemSpec({ spec: next })).result._tag,
  ).toBe('Success');
  expect(next.services.reservations.releases[3].actors.operator).toBe(
    actorVersion,
  );
  expect(
    next.services.reservations.actorVersions.operator?.[actorVersion],
  ).toEqual(actor);
  expect(next.services.reservations.releases[3].contracts).toEqual(
    service.contracts,
  );
});

it('gates physical registration by hash and records Aggregate membership during activation', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const spec = makeSystemSpec({ system });
  const registration: IRepoRegistration = {
    repoType: 'AggregateChain',
    repoName: 'ac_sys_servicePublication/acc_spec/account',
    tableNames: ['commands'],
  };
  expect(
    (await systemRepo.registerRepo({ registration, systemSpecHash: spec.hash }))
      .result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'system-spec-not-accepted' },
  });
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(db.select().from(schema.acceptedSystemSpecs).all()).toEqual([]);
    expect(db.select().from(schema.repos).all()).toEqual([]);
    expect(db.select().from(schema.aggregates).all()).toEqual([]);
  });
  expect((await systemRepo.registerSystemSpec({ spec })).result._tag).toBe(
    'Success',
  );
  expect(
    (
      await systemRepo.registerRepo({
        registration,
        systemSpecHash: 'malformed',
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'system-spec-invalid' },
  });
  await runInDurableObject(systemRepo, (_, { storage }) => {
    storage.sql
      .exec(`CREATE TRIGGER spec_no_insert BEFORE INSERT ON acceptedSystemSpecs BEGIN
      SELECT RAISE(ABORT, 'registration inserted a snapshot'); END`);
  });
  expect(
    (await systemRepo.registerRepo({ registration, systemSpecHash: spec.hash }))
      .result._tag,
  ).toBe('Success');
  const tableNames = ['commands', 'replaySubscribers'];
  expect(
    (
      await systemRepo.registerRepo({
        registration: { ...registration, tableNames },
        systemSpecHash: spec.hash,
      })
    ).result._tag,
  ).toBe('Success');
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(db.select().from(schema.acceptedSystemSpecs).all()).toHaveLength(1);
    expect(db.select().from(schema.aggregates).all()).toEqual([]);
    expect(db.select().from(schema.repos).all()).toEqual([
      {
        repoType: registration.repoType,
        repoName: registration.repoName,
        tableNames: JSON.stringify(tableNames),
      },
    ]);
  });
  expect(
    (
      await systemRepo.registerAggregate({
        aggregateName: 'account',
        // @ts-expect-error Membership rejects a non-string Aggregate ID at the RPC boundary.
        aggregateId: 42,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'aggregate-registration-invalid' },
  });
  const aggregate = { aggregateName: 'account', aggregateId: 'acc_spec' };
  expect((await systemRepo.hasAggregate(aggregate)).result).toEqual({
    _tag: 'Success',
    success: false,
  });
  const aggregateChain = exports.AggregateChain.getByName(
    registration.repoName,
  );
  expect((await aggregateChain.awaitStartup()).result._tag).toBe('Success');
  expect((await systemRepo.hasAggregate(aggregate)).result).toEqual({
    _tag: 'Success',
    success: true,
  });
  expect((await systemRepo.registerAggregate(aggregate)).result._tag).toBe(
    'Success',
  );
  await runInDurableObject(systemRepo, ({ db, schema }, { storage }) => {
    storage.sql.exec('DROP TRIGGER spec_no_insert');
    expect(db.select().from(schema.acceptedSystemSpecs).all()).toHaveLength(1);
    expect(db.select().from(schema.aggregates).all()).toEqual([aggregate]);
  });

  const membershipFailure = await config.managedRuntime.runPromise(
    Effect.fail(makeZerospinError('drizzle-transaction-failed')).pipe(
      makeWorkerRpcEnvelope,
    ),
  );
  const registerAggregate = vi
    .spyOn(SystemRepo.prototype, 'registerAggregate')
    .mockResolvedValue(membershipFailure);
  await runInDurableObject(aggregateChain, async repo => {
    const result = await config.managedRuntime.runPromise(
      repo.onRepoStartup().pipe(Effect.exit),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(Cause.pretty(result.cause)).toContain(
        'drizzle-transaction-failed',
      );
    }
  });
  registerAggregate.mockRestore();
});

it('issues hash-only tickets for four authored admission kinds and validates before generating a secret', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  const candidate = makeSystemSpec({
    system: makeSystem({ name: 'otherCandidate', aggregates: {} }),
  });
  expect(
    (await systemRepo.registerSystemSpec({ spec: candidate })).result._tag,
  ).toBe('Success');
  const randomBeforeAcceptance = vi.spyOn(crypto, 'getRandomValues');
  for (const [admission, code] of [
    [aggregateActorAdmission, 'system-spec-not-accepted'],
    [aggregateAgentAdmission, 'system-spec-not-accepted'],
    [serviceActorAdmission, 'system-spec-not-accepted'],
    [serviceAgentAdmission, 'system-spec-not-accepted'],
  ] as const) {
    expect(
      (await systemRepo.createSessionWebSocketTicket({ admission })).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code },
    });
  }
  expect(
    randomBeforeAcceptance.mock.calls.filter(
      ([bytes]) => bytes?.byteLength === 32,
    ),
  ).toEqual([]);
  randomBeforeAcceptance.mockRestore();
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(db.select().from(schema.sessionWebSocketTickets).all()).toEqual([]);
  });
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const issued: {
    ticket: string;
    admission: ISessionAdmission;
    startedAt: number;
    endedAt: number;
  }[] = [];
  for (const admission of [
    aggregateActorAdmission,
    aggregateAgentAdmission,
    serviceActorAdmission,
    serviceAgentAdmission,
  ]) {
    const startedAt = Date.now();
    const reply = await systemRepo.createSessionWebSocketTicket({ admission });
    if (reply.result._tag !== 'Success') {
      throw new Error('Expected a ticket for the authored admission');
    }
    issued.push({
      ticket: reply.result.success,
      admission,
      startedAt,
      endedAt: Date.now(),
    });
  }
  const retained = await runInDurableObject(
    systemRepo,
    async ({ db, schema }, { storage }) => {
      expect(
        storage.sql
          .exec<{ name: string; type: string; notnull: number; pk: number }>(
            'PRAGMA table_info(sessionWebSocketTickets)',
          )
          .toArray()
          .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
      ).toEqual([
        { name: 'ticketHash', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'sessionFamily', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'admission', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'expiresAt', type: 'INTEGER', notnull: 1, pk: 0 },
      ]);
      const indexes = storage.sql
        .exec<{ name: string; unique: number }>(
          'PRAGMA index_list(sessionWebSocketTickets)',
        )
        .toArray();
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.unique).toBe(1);
      expect(
        storage.sql
          .exec<{ name: string }>(`PRAGMA index_info('${indexes[0]?.name}')`)
          .toArray()
          .map(column => column.name),
      ).toEqual(['ticketHash']);
      const rows = db
        .select()
        .from(schema.sessionWebSocketTickets)
        .orderBy(schema.sessionWebSocketTickets.ticketHash)
        .all();
      expect(rows).toHaveLength(4);
      for (const { ticket, admission, startedAt, endedAt } of issued) {
        expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(ticket),
        );
        const ticketHash = btoa(String.fromCharCode(...new Uint8Array(digest)))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replaceAll('=', '');
        const row = rows.find(row => row.ticketHash === ticketHash);
        const decoded = Effect.runSync(
          systemRepoDbConfig.tables.sessionWebSocketTickets.decodeRow(row),
        );
        expect(decoded).toEqual({
          ticketHash,
          sessionFamily: sessionAdmissionFamily(admission),
          admission,
          expiresAt: expect.any(Date),
        });
        expect(decoded.expiresAt.getTime()).toBeGreaterThanOrEqual(
          startedAt + 30_000,
        );
        expect(decoded.expiresAt.getTime()).toBeLessThanOrEqual(
          endedAt + 30_000,
        );
        expect(JSON.stringify(rows)).not.toContain(ticket);
        expect(decoded.admission).not.toHaveProperty('sessionName');
        expect(decoded.admission).not.toHaveProperty('actorName');
        expect(decoded.admission).not.toHaveProperty('actorVersion');
        expect(decoded.admission).not.toHaveProperty('agentName');
        expect(decoded.admission).not.toHaveProperty('agentVersion');
        expect(decoded.admission).not.toHaveProperty('origin');
        if (
          decoded.admission.kind === 'aggregateAgent' ||
          decoded.admission.kind === 'serviceAgent'
        ) {
          expect(decoded.admission).not.toHaveProperty('claims');
        }
      }
      return rows;
    },
  );
  const random = vi.spyOn(crypto, 'getRandomValues');
  const repeatedIdentity = { ...serviceActorAdmission, actorName: 'operator' };
  expect(
    (
      await systemRepo.createSessionWebSocketTicket({
        admission: repeatedIdentity,
      })
    ).result,
  ).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'session-websocket-admission-invalid' },
  });
  const invalid: readonly { admission: unknown; code: string }[] = [
    {
      admission: {
        ...serviceActorAdmission,
        serviceSessionLock: {
          ...serviceActorAdmission.serviceSessionLock,
          sessionName: '',
        },
      },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...aggregateAgentAdmission, nodeId: null },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...serviceAgentAdmission, nodeId: null },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...serviceAgentAdmission, nodeId: '' },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...serviceActorAdmission, claims: { viewerId: 'one' } },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...serviceActorAdmission, actorPath: '/different' },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...aggregateActorAdmission, aggregateId: 'acc_different' },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: {
        ...aggregateActorAdmission,
        origin: {
          ...aggregateActorAdmission.aggregateSessionLock.origin,
          claims: aggregateActorAdmission.claims,
        },
      },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: {
        ...aggregateActorAdmission,
        aggregateSessionLock: aggregateAgentAdmission.aggregateSessionLock,
      },
      code: 'session-websocket-admission-invalid',
    },
    {
      admission: { ...serviceAgentAdmission, serviceVersion: 2 },
      code: 'service-agent-session-lock-invalid',
    },
    {
      admission: {
        ...serviceActorAdmission,
        serviceSessionLock: {
          ...serviceActorAdmission.serviceSessionLock,
          contracts: {
            ...serviceActorAdmission.serviceSessionLock.contracts,
            createReservation: {
              commandName: 'createReservation',
              version: 2,
            },
          },
        },
      },
      code: 'service-session-lock-unsupported',
    },
    {
      admission: {
        ...aggregateAgentAdmission,
        aggregateSessionLock: {
          ...aggregateAgentAdmission.aggregateSessionLock,
          contracts: {},
        },
      },
      code: 'session-websocket-admission-invalid',
    },
  ];
  for (const { admission, code } of invalid) {
    // Malformed wire input reaches the typed RPC boundary without casting it into an admitted domain value.
    const rejected = await Reflect.apply(
      systemRepo.createSessionWebSocketTicket,
      systemRepo,
      [{ admission }],
    );
    expect(rejected.result).toMatchObject({
      _tag: 'Failure',
      failure: { code },
    });
  }
  await runInDurableObject(systemRepo, ({ db, schema }) => {
    expect(
      db
        .select()
        .from(schema.sessionWebSocketTickets)
        .orderBy(schema.sessionWebSocketTickets.ticketHash)
        .all(),
    ).toEqual(retained);
  });
  expect(
    random.mock.calls.filter(([bytes]) => bytes?.byteLength === 32),
  ).toEqual([]);
});

it('rolls back expiry cleanup with failed issuance and spends a retained ticket once after reconstruction', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const admission: ISessionAdmission = {
    ...serviceActorAdmission,
    nodeId: 'node_ticket_actor',
  };
  const issue = async () => {
    const reply = await systemRepo.createSessionWebSocketTicket({ admission });
    if (reply.result._tag !== 'Success') {
      throw new Error('Expected a ticket for the authored admission');
    }
    return reply.result.success;
  };
  await issue();
  const expiredHash = await runInDurableObject(
    systemRepo,
    ({ db, schema }) =>
      db.select().from(schema.sessionWebSocketTickets).get()?.ticketHash,
  );
  if (expiredHash === undefined) {
    throw new Error('Expected the first retained ticket');
  }
  const liveTicket = await issue();
  const before = await runInDurableObject(
    systemRepo,
    ({ db, schema }, { storage }) => {
      storage.sql.exec(
        'UPDATE sessionWebSocketTickets SET expiresAt = ? WHERE ticketHash = ?',
        Date.now() - 1,
        expiredHash,
      );
      const rows = db
        .select()
        .from(schema.sessionWebSocketTickets)
        .orderBy(schema.sessionWebSocketTickets.ticketHash)
        .all();
      storage.sql
        .exec(`CREATE TRIGGER ticket_insert_failure BEFORE INSERT ON sessionWebSocketTickets BEGIN
      SELECT RAISE(ABORT, 'ticket insertion failed after expiry cleanup'); END`);
      return rows;
    },
  );
  await runInDurableObject(systemRepo, async repo => {
    await expect(
      repo.createSessionWebSocketTicket({ admission }),
    ).rejects.toThrow('Failed query: insert into "sessionWebSocketTickets"');
  });
  await runInDurableObject(systemRepo, ({ db, schema }, { storage }) => {
    expect(
      db
        .select()
        .from(schema.sessionWebSocketTickets)
        .orderBy(schema.sessionWebSocketTickets.ticketHash)
        .all(),
    ).toEqual(before);
    storage.sql.exec('DROP TRIGGER ticket_insert_failure');
  });
  await issue();
  await runInDurableObject(systemRepo, async ({ db, schema }) => {
    const rows = db.select().from(schema.sessionWebSocketTickets).all();
    expect(rows).toHaveLength(2);
    expect(rows.some(row => row.ticketHash === expiredHash)).toBe(false);
    expect(
      (
        await config.managedRuntime.runPromise(
          consumeSessionWebSocketTicket({
            db,
            ticket: liveTicket,
            sessionFamily: 'aggregate',
          }).pipe(makeWorkerRpcEnvelope),
        )
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-session-websocket-ticket-invalid' },
    });
    expect(db.select().from(schema.sessionWebSocketTickets).all()).toEqual(
      rows,
    );
  });
  await evictDurableObject(systemRepo);
  await runInDurableObject(systemRepo, async ({ db, schema }) => {
    const replies = await Promise.all(
      [1, 2].map(() =>
        config.managedRuntime.runPromise(
          consumeSessionWebSocketTicket({
            db,
            ticket: liveTicket,
            sessionFamily: 'service',
          }).pipe(makeWorkerRpcEnvelope),
        ),
      ),
    );
    expect(replies.map(reply => reply.result._tag).sort()).toEqual([
      'Failure',
      'Success',
    ]);
    expect(
      replies.find(reply => reply.result._tag === 'Success')?.result,
    ).toEqual({ _tag: 'Success', success: admission });
    expect(
      replies.find(reply => reply.result._tag === 'Failure')?.result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-session-websocket-ticket-invalid' },
    });
    expect(db.select().from(schema.sessionWebSocketTickets).all()).toHaveLength(
      1,
    );
  });
  await evictDurableObject(systemRepo);
  await runInDurableObject(systemRepo, async ({ db }) => {
    expect(
      (
        await config.managedRuntime.runPromise(
          consumeSessionWebSocketTicket({
            db,
            ticket: liveTicket,
            sessionFamily: 'service',
          }).pipe(makeWorkerRpcEnvelope),
        )
      ).result,
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-session-websocket-ticket-invalid' },
    });
  });
});

it('burns tickets at their exact deadline and before rejecting malformed or mismatched retained admissions', async () => {
  const systemRepo = exports.SystemRepo.getByName('sys_servicePublication');
  expect(
    (await systemRepo.registerSystemSpec({ spec: makeSystemSpec({ system }) }))
      .result._tag,
  ).toBe('Success');
  const issue = async () => {
    const reply = await systemRepo.createSessionWebSocketTicket({
      admission: serviceActorAdmission,
    });
    if (reply.result._tag !== 'Success') {
      throw new Error('Expected a ticket for the authored admission');
    }
    return reply.result.success;
  };
  const deadlineTicket = await issue();
  await runInDurableObject(systemRepo, async ({ db, schema }, { storage }) => {
    const deadline = Date.now() + 1_000;
    storage.sql.exec(
      'UPDATE sessionWebSocketTickets SET expiresAt = ?',
      deadline,
    );
    const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline);
    try {
      expect(
        (
          await config.managedRuntime.runPromise(
            consumeSessionWebSocketTicket({
              db,
              ticket: deadlineTicket,
              sessionFamily: 'service',
            }).pipe(makeWorkerRpcEnvelope),
          )
        ).result,
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'service-session-websocket-ticket-invalid' },
      });
      expect(db.select().from(schema.sessionWebSocketTickets).all()).toEqual(
        [],
      );
    } finally {
      clock.mockRestore();
    }
  });
  for (const { retainedAdmission, code } of [
    { retainedAdmission: '{', code: 'session-websocket-ticket-row-invalid' },
    {
      retainedAdmission: JSON.stringify({
        ...serviceAgentAdmission,
        origin: { kind: 'agent', agentName: 'serviceExpiry', agentVersion: 1 },
      }),
      code: 'session-websocket-ticket-row-invalid',
    },
    {
      retainedAdmission: JSON.stringify(aggregateActorAdmission),
      code: 'service-session-websocket-ticket-invalid',
    },
  ]) {
    const ticket = await issue();
    await runInDurableObject(
      systemRepo,
      async ({ db, schema }, { storage }) => {
        storage.sql.exec(
          'UPDATE sessionWebSocketTickets SET admission = ?',
          retainedAdmission,
        );
        const retained = db.select().from(schema.sessionWebSocketTickets).all();
        expect(
          (
            await config.managedRuntime.runPromise(
              consumeSessionWebSocketTicket({
                db,
                ticket,
                sessionFamily: 'aggregate',
              }).pipe(makeWorkerRpcEnvelope),
            )
          ).result,
        ).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'aggregate-session-websocket-ticket-invalid' },
        });
        expect(db.select().from(schema.sessionWebSocketTickets).all()).toEqual(
          retained,
        );
        expect(
          (
            await config.managedRuntime.runPromise(
              consumeSessionWebSocketTicket({
                db,
                ticket,
                sessionFamily: 'service',
              }).pipe(makeWorkerRpcEnvelope),
            )
          ).result,
        ).toMatchObject({ _tag: 'Failure', failure: { code } });
        expect(db.select().from(schema.sessionWebSocketTickets).all()).toEqual(
          [],
        );
        expect(
          (
            await config.managedRuntime.runPromise(
              consumeSessionWebSocketTicket({
                db,
                ticket,
                sessionFamily: 'service',
              }).pipe(makeWorkerRpcEnvelope),
            )
          ).result,
        ).toMatchObject({
          _tag: 'Failure',
          failure: { code: 'service-session-websocket-ticket-invalid' },
        });
      },
    );
  }
});
