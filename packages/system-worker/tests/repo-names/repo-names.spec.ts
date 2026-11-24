import { createElement } from 'react';

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
import Seed from '@zerospin/cli/dist/commands/seed.js';
import type { ILoadConfigResults } from '@zerospin/cli/dist/deploy/loadConfigFn.js';
import { seedFn } from '@zerospin/cli/dist/seed/seedFn.js';
import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { updateAggregateActorRelease } from '@zerospin/core/aggregateActor/updateAggregateActorRelease';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { ContractSpecSchema } from '@zerospin/core/contracts/ContractSpecSchema';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeAggregateContractExtension } from '@zerospin/core/contracts/makeAggregateContractExtension';
import { makeContractSpec } from '@zerospin/core/declaration/makeContractSpec';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import type { IAggregateAuthentication } from '@zerospin/core/identity/types';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeLimitedModelVersion } from '@zerospin/core/models/make/makeLimitedModelVersion';
import {
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/make/makeModelVersion';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { modelRef } from '@zerospin/core/models/modelRef';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { updateServiceActorRelease } from '@zerospin/core/serviceActor/updateServiceActorRelease';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { RepoTypeSchema } from '@zerospin/core/system/RepoTypeSchema';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import type { ISystemApiRpc } from '@zerospin/core/systemApi/ISystemApiRpc';
import { ServiceQuerySchema } from '@zerospin/core/systemApi/ServiceQuerySchema';
import type { IApi } from '@zerospin/core/utils/getApi/getApi';
import { makeSystemApi } from '@zerospin/core/utils/getSystemApi/makeSystemApi';
import {
  configureAgentPlacement,
  makeAgentWranglerConfig,
  makeOwnerReleaseWranglerConfig,
  makeWranglerConfig,
} from '@zerospin/dev-worker/makeWranglerConfig';
import { encodeError, makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expectTypeOf, vi } from 'vitest';

import { receiptsServiceReleaseV1 } from '../../../core/tests/fixtures/receipts/receiptsServiceReleaseV1.ts';
import { sendExternalReceiptV1 } from '../../../core/tests/fixtures/receipts/sendExternalReceiptV1.ts';
import { aggregateAgentNodeRepoMigratableDORepoConfig } from '../../src/AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.ts';
import { aggregateVersionRepoName } from '../../src/AggregateVersionRepo/aggregateVersionRepoName.ts';
import { makeRepoNameUtils } from '../../src/makeDORepo/makeRepoNameUtils.ts';
import { serviceAgentNodeRepoMigratableDORepoConfig } from '../../src/ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.ts';
import type { getServiceVersionRepo } from '../../src/ServiceVersionRepo/getServiceVersionRepo.ts';
import { accountV1 } from '../declarations/aggregates/accountV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationsV1 } from '../declarations/services/reservationsV1.ts';

const seedMocks = vi.hoisted(() => {
  const state: {
    config?: Pick<ILoadConfigResults, 'zerospinApiUrl' | 'zerospinSecretKey'>;
    rpc?: IApi<ISystemApiRpc>;
  } = {};
  return state;
});
vi.mock('@zerospin/cli/dist/deploy/loadConfigFn.js', () => ({
  loadConfigFn: () => {
    if (seedMocks.config === undefined) {
      throw new Error('Seed configuration was not provided');
    }
    return Effect.succeed(seedMocks.config);
  },
}));
vi.mock('@zerospin/core/utils/getApi/getApi', () => ({
  getApi: () => () => {
    if (seedMocks.rpc === undefined) {
      throw new Error('Seed RPC was not provided');
    }
    return Effect.succeed(seedMocks.rpc);
  },
}));
vi.mock('@zerospin/cli/dist/ProcedureStep/useProgram.js', () => ({
  useProgram: () => ({ status: 'success', data: undefined, error: undefined }),
}));

it('keeps original Service delivery off shared release handles', () => {
  type IOrdinaryRepo = Effect.Success<ReturnType<typeof getServiceVersionRepo>>;
  type IReleaseWorker = NonNullable<
    Cloudflare.Env[`ZEROSPIN_RELEASE_${string}`]
  >;
  type IHostedDispatch = NonNullable<
    Cloudflare.Env['ZEROSPIN_HOSTED_SERVICE_DISPATCH']
  >;
  type IColocatedRepo = ReturnType<
    Cloudflare.IDORepoNamespaces['SERVICE_VERSION_REPO']['getByName']
  >;

  expectTypeOf<IOrdinaryRepo>().not.toHaveProperty('executeCommandSubscriber');
  expectTypeOf<
    Awaited<ReturnType<IReleaseWorker['getServiceVersionRepo']>>
  >().not.toHaveProperty('executeCommandSubscriber');
  expectTypeOf<
    Awaited<ReturnType<IHostedDispatch['getServiceVersionRepo']>>
  >().not.toHaveProperty('executeCommandSubscriber');
  expectTypeOf<IColocatedRepo>().not.toHaveProperty('executeCommandSubscriber');
  expectTypeOf<
    ReturnType<Cloudflare.Env['SERVICE_VERSION_REPO']['getByName']>
  >().not.toHaveProperty('executeCommandSubscriber');
  expectTypeOf<IOrdinaryRepo['awaitCommandResult']>().toBeCallableWith({
    serviceIndex: 1,
  });
});

it('places Repo namespaces on the configured System, owner and Agent Workers', async () => {
  const config = makeConfig({
    system: makeSystem({ name: 'bindings', aggregates: {} }),
    systemId: 'sys_bindings',
  });
  const bindings = [
    { name: 'SYSTEM_REPO', class_name: 'SystemRepo' },
    { name: 'AGGREGATE_CHAIN', class_name: 'AggregateChain' },
    { name: 'AGGREGATE_VERSION_REPO', class_name: 'AggregateVersionRepo' },
    { name: 'AGGREGATE_VERSION_CHAIN', class_name: 'AggregateVersionChain' },
    {
      name: 'AGGREGATE_VERSION_ARCHIVE',
      class_name: 'AggregateVersionArchive',
    },
    {
      name: 'AGGREGATE_ACTOR_VERSION_ARCHIVE',
      class_name: 'AggregateActorVersionArchive',
    },
    {
      name: 'AGGREGATE_ACTOR_VERSION_REPO',
      class_name: 'AggregateActorVersionRepo',
    },
    {
      name: 'AGGREGATE_AGENT_VERSION_REPO',
      class_name: 'AggregateAgentVersionRepo',
    },
    { name: 'AGGREGATE_AGENT_NODE_REPO', class_name: 'AggregateAgentNodeRepo' },
    { name: 'SERVICE_CHAIN', class_name: 'ServiceChain' },
    { name: 'SERVICE_VERSION_REPO', class_name: 'ServiceVersionRepo' },
    { name: 'SERVICE_VERSION_CHAIN', class_name: 'ServiceVersionChain' },
    { name: 'SERVICE_VERSION_ARCHIVE', class_name: 'ServiceVersionArchive' },
    {
      name: 'SERVICE_ACTOR_VERSION_ARCHIVE',
      class_name: 'ServiceActorVersionArchive',
    },
    {
      name: 'SERVICE_ACTOR_VERSION_REPO',
      class_name: 'ServiceActorVersionRepo',
    },
    {
      name: 'SERVICE_AGENT_VERSION_REPO',
      class_name: 'ServiceAgentVersionRepo',
    },
    { name: 'SERVICE_AGENT_NODE_REPO', class_name: 'ServiceAgentNodeRepo' },
    {
      name: 'AGGREGATE_ACTOR_VERSION_CHAIN',
      class_name: 'AggregateActorVersionChain',
    },
    {
      name: 'AGGREGATE_AGENT_VERSION_CHAIN',
      class_name: 'AggregateAgentVersionChain',
    },
    {
      name: 'SERVICE_ACTOR_VERSION_CHAIN',
      class_name: 'ServiceActorVersionChain',
    },
    {
      name: 'SERVICE_AGENT_VERSION_CHAIN',
      class_name: 'ServiceAgentVersionChain',
    },
  ];
  try {
    expect(RepoTypeSchema.literals.toSorted()).toEqual(
      bindings.map(binding => binding.class_name).toSorted(),
    );
    expect(Schema.is(RepoTypeSchema)('SystemLogRepo')).toBe(false);
    const environments: ('dev' | 'production')[] = ['dev', 'production'];
    for (const environment of environments) {
      const generated = makeWranglerConfig({
        config,
        main: `./${environment}-worker.ts`,
        configModulePath: './zerospin.config.ts',
        environment,
      });
      const expectedBindings =
        environment === 'production'
          ? bindings.filter(binding =>
              ['SYSTEM_REPO', 'AGGREGATE_CHAIN', 'SERVICE_CHAIN'].includes(
                binding.name,
              ),
            )
          : bindings;
      expect(
        generated.durable_objects.bindings.toSorted((a, b) =>
          a.name.localeCompare(b.name),
        ),
      ).toEqual(
        expectedBindings.toSorted((a, b) => a.name.localeCompare(b.name)),
      );
      expect(generated.exports).toEqual(
        Object.fromEntries(
          expectedBindings.map(binding => [
            binding.class_name,
            { type: 'durable-object', storage: 'sqlite' },
          ]),
        ),
      );
      expect(generated.vars).toEqual({
        ZEROSPIN_ENVIRONMENT: environment,
        ZEROSPIN_SYSTEM_ID: 'sys_bindings',
        ZEROSPIN_SYSTEM_NAME: 'bindings',
        ...(environment === 'production'
          ? {
              ZEROSPIN_SYSTEM_SPEC_HASH: '',
              ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
            }
          : {}),
      });
      expect(generated.version_metadata).toEqual(
        environment === 'production'
          ? { binding: 'ZEROSPIN_VERSION_METADATA' }
          : undefined,
      );
      if (environment === 'production') {
        const agent = makeAgentWranglerConfig({
          stable: generated,
          main: './agent-worker.ts',
          configModulePath: './zerospin.config.ts',
          application: undefined,
        });
        const separate = configureAgentPlacement(generated, 'separate');
        const bootstrap = configureAgentPlacement(generated, 'bootstrap');
        const agentNamespaces = bindings.filter(binding =>
          binding.name.includes('_AGENT_'),
        );
        const roots = generated.durable_objects.bindings.filter(binding =>
          ['SYSTEM_REPO', 'AGGREGATE_CHAIN', 'SERVICE_CHAIN'].includes(
            binding.name,
          ),
        );
        expect(generated.alias).toBeUndefined();
        expect(agent.name).toBe('bindings-zerospin-agents');
        expect(agent.durable_objects.bindings).toEqual(
          expect.arrayContaining([
            ...agentNamespaces,
            ...roots.map(binding => ({
              ...binding,
              script_name: generated.name,
            })),
          ]),
        );
        expect(separate.durable_objects.bindings).toEqual(
          expect.arrayContaining([
            ...bootstrap.durable_objects.bindings,
            ...agentNamespaces.map(binding => ({
              ...binding,
              script_name: agent.name,
            })),
          ]),
        );
        expect(bootstrap.durable_objects.bindings).toEqual(
          generated.durable_objects.bindings,
        );
        expect(Object.keys(agent.exports).sort()).toEqual(
          agentNamespaces.map(binding => binding.class_name).sort(),
        );
        expect(separate.exports).toEqual(bootstrap.exports);
        for (const { release, family } of [
          {
            release: { aggregateName: 'account', aggregateVersion: 1 },
            family: 'AGGREGATE',
          },
          {
            release: { serviceName: 'reservations', serviceVersion: 1 },
            family: 'SERVICE',
          },
        ]) {
          const owner = makeOwnerReleaseWranglerConfig({
            stable: generated,
            release,
            main: './owner-release-worker.ts',
            application: undefined,
          });
          const owned = bindings.filter(
            binding =>
              binding.name.startsWith(family + '_') &&
              !binding.name.includes('_AGENT_') &&
              binding.name.includes('_VERSION_'),
          );
          expect(owner.durable_objects.bindings).toHaveLength(
            owned.length + roots.length + agentNamespaces.length,
          );
          expect(owner.durable_objects.bindings).toEqual(
            expect.arrayContaining([
              ...owned,
              ...roots.map(binding => ({
                ...binding,
                script_name: generated.name,
              })),
              ...agentNamespaces.map(binding => ({
                ...binding,
                script_name: agent.name,
              })),
            ]),
          );
          expect(Object.keys(owner.exports).sort()).toEqual(
            owned.map(binding => binding.class_name).sort(),
          );
          expect(owner.vars.ZEROSPIN_OWNER_RELEASE).toEqual(release);
          expect(owner).not.toHaveProperty('alias.config');
        }
      }
    }
  } finally {
    await config.managedRuntime.dispose();
  }
});

it('adds application Wrangler bindings without replacing framework configuration', () => {
  const wrangler = {
    r2_buckets: [{ binding: 'BUCKET', bucket_name: 'attachments' }],
    send_email: [{ name: 'EMAIL' }],
    vars: { FROM: 'example@example.com' },
  };
  const config = makeConfig({
    system: makeSystem({ name: 'bindings', aggregates: {} }),
    systemId: 'sys_bindings',
    wrangler,
  });
  const props = {
    config,
    main: 'worker.ts',
    configModulePath: 'zerospin.config.ts',
  };
  expect(makeWranglerConfig({ ...props, environment: 'dev' })).toMatchObject({
    ...wrangler,
    vars: { ...wrangler.vars, ZEROSPIN_ENVIRONMENT: 'dev' },
  });
  const stable = makeWranglerConfig({ ...props, environment: 'production' });
  expect(stable).not.toHaveProperty('r2_buckets');
  expect(stable).not.toHaveProperty('send_email');
  expect(stable.vars).not.toHaveProperty('FROM');
  expect(
    makeOwnerReleaseWranglerConfig({
      stable,
      release: { aggregateName: 'account', aggregateVersion: 1 },
      main: './owner-release-worker.ts',
      application: wrangler,
    }),
  ).toMatchObject(wrangler);
  expect(() =>
    makeWranglerConfig({
      ...props,
      config: {
        ...config,
        wrangler: { vars: { ZEROSPIN_DEV_HISTORY: 'app override' } },
      },
      environment: 'dev',
    }),
  ).toThrow(/ZEROSPIN_DEV_HISTORY/);
  expect(() =>
    makeWranglerConfig({
      ...props,
      config: { ...config, wrangler: { main: 'other.ts' } },
      environment: 'dev',
    }),
  ).toThrow(/cannot set "main"/);
  expect(() =>
    makeWranglerConfig({
      ...props,
      config: {
        ...config,
        wrangler: { ...wrangler, send_email: [{ name: 'BUCKET' }] },
      },
      environment: 'production',
    }),
  ).toThrow(/binding "BUCKET"/);
});

it('rejects routing settings in application Wrangler configuration', () => {
  const system = makeSystem({ name: 'bindings', aggregates: {} });
  for (const [field, wrangler] of [
    ['routes', { routes: [{ pattern: 'example.com', custom_domain: true }] }],
    ['workers_dev', { workers_dev: false }],
    ['preview_urls', { preview_urls: false }],
  ] as const) {
    const config = makeConfig({ system, systemId: 'sys_bindings', wrangler });
    expect(() =>
      makeWranglerConfig({
        config,
        main: 'worker.ts',
        configModulePath: 'zerospin.config.ts',
        environment: 'production',
      }),
    ).toThrow(`System Wrangler configuration cannot set "${field}".`);
  }
});

describe('Integer revisions', () => {
  it.effect(
    'keeps Agent Node Repo identities independent of owner releases',
    () =>
      Effect.gen(function* () {
        const aggregateKey = {
          systemId: 'sys_one',
          aggregateName: 'game',
          aggregateId: 'game_one',
          agentName: 'expiry',
        };
        const serviceKey = {
          systemId: 'sys_one',
          serviceName: 'promotion',
          agentName: 'expiry',
        };
        const aggregateNames =
          aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils;
        const serviceNames =
          serviceAgentNodeRepoMigratableDORepoConfig.nameUtils;
        expect(yield* aggregateNames.makeName(aggregateKey)).toBe(
          'aanr_sys_one/game/game_one/expiry',
        );
        expect(
          yield* aggregateNames.parseName(
            yield* aggregateNames.makeName(aggregateKey),
          ),
        ).toEqual(aggregateKey);
        expect(yield* serviceNames.makeName(serviceKey)).toBe(
          'sanr_sys_one/promotion/expiry',
        );
        expect(
          yield* serviceNames.parseName(
            yield* serviceNames.makeName(serviceKey),
          ),
        ).toEqual(serviceKey);
      }),
  );

  it.effect('survive command serialization and physical Repo names', () =>
    Effect.gen(function* () {
      const command = {
        id: 'cmd_integer_version',
        commandName: 'playX',
        payload: '{}',
        contractVersion: 12,
        aggregateId: 'game_one',
        aggregateName: 'game',
        aggregateVersion: 2,
        kind: 'system',
      };
      expect(
        Schema.decodeUnknownSync(EncodedAggregateCommandSchema)(
          JSON.parse(JSON.stringify(command)),
        ),
      ).toEqual(command);
      for (const invalid of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
        expect(Schema.is(VersionSchema)(invalid)).toBe(false);
        expect(
          Schema.is(EncodedAggregateCommandSchema)({
            ...command,
            contractVersion: invalid,
          }),
        ).toBe(false);
      }
      const names = makeRepoNameUtils(aggregateVersionRepoName);
      const key = {
        systemId: 'sys_one',
        aggregateName: 'game',
        aggregateVersion: 12,
        aggregateId: 'game_one',
      };
      const name = yield* names.makeName(key);
      expect(yield* names.parseName(name)).toEqual(key);
      for (const invalid of ['01', '1e0']) {
        const parsed = yield* Effect.exit(
          names.parseName(name.replace('/12', `/${invalid}`)),
        );
        expect(Exit.isFailure(parsed)).toBe(true);
      }
    }),
  );
});

describe('Actor Release specs', () => {
  it('preserves Effect service requirements on extensions and continuations', () => {
    class RequiredService extends Context.Service<
      RequiredService,
      { value: string }
    >()('tests/RequiredService') {}
    const extension = makeAggregateContractExtension(
      accountV1.system.receiveCommand,
      {
        models: {},
        operations: {},
        program: () => Effect.service(RequiredService).pipe(Effect.asVoid),
      },
    );
    const continuation = makeServiceContractRelease(
      defineServiceContract('typedContinuation'),
      {
        version: 1,
        payload: {},
        program: () => Effect.service(RequiredService).pipe(Effect.asVoid),
      },
    );
    expectTypeOf<
      Effect.Services<ReturnType<typeof extension.evaluate>>
    >().toEqualTypeOf<RequiredService>();
    expectTypeOf<
      Effect.Services<ReturnType<typeof continuation.evaluate>>
    >().toEqualTypeOf<RequiredService>();
  });
  it('inherits fixed captures and captures only replaced selections', () => {
    const viewer = accountV1.actors.viewer;
    const db = makeQueryDbVersion({
      models: {
        reservation: reservationV1,
        agentReservation: agentReservationV1,
      },
    });
    const expression = sql.raw('1 = 1');
    const raw = vi.fn(() => expression);
    const options = { where: { expiresAt: { eq: 1 }, RAW: raw } };
    const selection = db.query.reservation.findMany(options);
    const actor = makeAggregateActorRelease(
      { name: 'fixed' },
      {
        version: 1,
        db,
        exposedModels: db.models,
        identity: viewer.identity,
        authentication: viewer.authentication,
        contracts: {},
        selections: {
          reservation: selection,
          agentReservation: db.query.agentReservation.findMany(),
        },
      },
    );
    const original = actor.capturedSelections.reservation;
    const definition = structuredClone(original.definition);
    const query = original.bind({});
    options.where.expiresAt.eq = 2;
    expression.append(sql.raw(' and 0 = 1'));
    raw.mockClear();

    const inherited = updateAggregateActorRelease(actor, {
      version: 2,
      selections: { reservation: selection },
    });
    expect(inherited).not.toBe(actor);
    expect(inherited.selections).not.toBe(actor.selections);
    expect(inherited.capturedSelections.reservation).toBe(original);
    expect(inherited.capturedSelections.reservation.definition).toEqual(
      definition,
    );
    expect(inherited.capturedSelections.reservation.bind({})).toEqual(query);
    expect(raw).not.toHaveBeenCalled();

    const replaced = updateAggregateActorRelease(inherited, {
      version: 3,
      selections: { reservation: db.query.reservation.findMany(options) },
    });
    expect(replaced.capturedSelections.reservation).not.toBe(original);
    expect(replaced.capturedSelections.reservation.bind({}).params).toEqual([
      2,
    ]);
    expect(replaced.capturedSelections.reservation.query.sql).toContain(
      '0 = 1',
    );
    expect(replaced.capturedSelections.agentReservation).toBe(
      actor.capturedSelections.agentReservation,
    );
    expect(actor.version).toBe(1);
    expect(original.definition).toEqual(definition);
    expect(original.bind({})).toEqual(query);
  });

  it('recaptures changed selection contexts and rejects incompatible contexts', () => {
    const viewer = accountV1.actors.viewer;
    const db = makeQueryDbVersion({ models: { reservation: reservationV1 } });
    const actor = makeAggregateActorRelease(
      { name: 'context' },
      {
        version: 1,
        db,
        exposedModels: db.models,
        identity: viewer.identity,
        authentication: viewer.authentication,
        contracts: {},
        selections: {
          reservation: db.query.reservation.findMany({
            where: { id: { eq: viewer.identity.sql.placeholder('viewerId') } },
          }),
        },
      },
    );
    const identity = makeActorIdentity({
      claims: viewer.identity.claimsSchema,
      actorPath: RoutePattern.parse('/:viewerId'),
    });
    const updated = updateAggregateActorRelease(actor, {
      version: 2,
      identity,
    });
    expect(updated.capturedSelections.reservation).not.toBe(
      actor.capturedSelections.reservation,
    );
    expect(
      updated.capturedSelections.reservation.bind({ viewerId: 'reader' })
        .params,
    ).toEqual(['reader']);
    expect(() =>
      updateAggregateActorRelease(actor, {
        version: 2,
        identity: makeActorIdentity({
          claims: viewer.identity.claimsSchema,
          actorPath: RoutePattern.parse('/'),
        }),
      }),
    ).toThrow('Undeclared selection identity field viewerId');

    const otherDb = makeQueryDbVersion({ models: db.models });
    const inherited = updateAggregateActorRelease(actor, {
      version: 2,
      db: otherDb,
    });
    expect(inherited.capturedSelections.reservation).toBe(
      actor.capturedSelections.reservation,
    );
    const extendedDb = makeQueryDbVersion({
      models: { ...db.models, agentReservation: agentReservationV1 },
    });
    const extended = updateAggregateActorRelease(actor, {
      version: 2,
      db: extendedDb,
      exposedModels: extendedDb.models,
      selections: {
        agentReservation: extendedDb.query.agentReservation.findMany(),
      },
    });
    expect(extended.capturedSelections.reservation).toBe(
      actor.capturedSelections.reservation,
    );
    const replacement = makeModelVersion(
      defineModel({ name: 'reservation', abbreviation: 'rsv' }),
      {
        version: 1,
        attributes: { expiresAt: primitives.integer() },
        indexes: [],
      },
    );
    const incompatibleDb = makeQueryDbVersion({
      models: { reservation: replacement },
    });
    expect(() =>
      Reflect.apply(updateAggregateActorRelease, undefined, [
        actor,
        { version: 2, db: incompatibleDb },
      ]),
    ).toThrow('Selection database model reservation differs');
    const rebound = updateAggregateActorRelease(actor, {
      version: 2,
      db: otherDb,
      selections: { reservation: otherDb.query.reservation.findMany() },
    });
    expect(rebound.capturedSelections.reservation).not.toBe(
      actor.capturedSelections.reservation,
    );
    expect(
      actor.capturedSelections.reservation.bind({ viewerId: 'reader' }).params,
    ).toEqual(['reader']);
  });

  it('keeps native capabilities and compiles portable metadata through makeSystemSpec', () => {
    const viewer = accountV1.actors.viewer;
    const operator = reservationsV1.actors.operator;
    const credentialsSchema = Schema.Struct({ viewerId: Schema.String });
    const authentication: IAggregateAuthentication<
      typeof credentialsSchema,
      typeof viewer.identity.claimsSchema
    > = {
      credentialsSchema,
      authenticate: props => {
        const { aggregateId, credentials } = props;
        return Effect.succeed({ aggregateId, ...credentials });
      },
    };
    const authorize = () => Effect.void;
    const aggregate = updateAggregateActorRelease(viewer, {
      version: 2,
      authentication,
      authorize,
    });
    const service = updateServiceActorRelease(operator, { version: 2 });
    const versions: readonly [2, 2] = [aggregate.version, service.version];
    expect(versions).toEqual([2, 2]);
    for (const actor of [viewer, operator, aggregate, service]) {
      expect(actor).not.toHaveProperty('spec');
      expect(Object.isFrozen(actor)).toBe(false);
    }
    expect(aggregate.authentication.credentialsSchema).toBe(credentialsSchema);
    expect(aggregate.authentication.authenticate).toBe(
      authentication.authenticate,
    );
    expect(aggregate.authorize).toBe(authorize);
    expect(service.authorize).toBe(operator.authorize);
    expect(service.identity.claimsSchema).toBe(operator.identity.claimsSchema);
    expect(service.db).toBe(operator.db);
    expect(viewer.version).toBe(1);
    expect(operator.version).toBe(1);
    const aggregateRelease = makeAggregateRelease(accountV1.definition, {
      version: 2,
      models: accountV1.models,
      system: accountV1.system,
      external: accountV1.external,
      actors: { ...accountV1.actors, viewer: aggregate },
    });
    for (const version of [2, 3]) {
      const release = makeServiceRelease(reservationsV1.definition, {
        version,
        models: reservationsV1.models,
        system: reservationsV1.system,
        external: reservationsV1.external,
        contracts: reservationsV1.contracts,
        actors: { operator: service },
      });
      const spec = makeSystemSpec({
        system: makeSystem({
          name: 'actorMetadata',
          aggregates: {
            account: { releases: { 2: aggregateRelease } },
          },
          services: {
            reservations: {
              releases: { [version]: release },
            },
          },
        }),
      });
      const aggregateFacts = spec.aggregates.account?.actorVersions.viewer?.[2];
      const serviceFacts =
        spec.services.reservations?.actorVersions.operator?.[service.version];
      expect(aggregateFacts?.version).toBe(2);
      expect(aggregateFacts?.authentication).toHaveProperty(
        'credentialsJsonSchema',
      );
      expect(serviceFacts?.authentication).toBe('none');
      expect(serviceFacts?.contracts.createReservation).toBe(1);
      expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
      expect(release).not.toHaveProperty('spec');
      expect(Object.isFrozen(release)).toBe(false);
      expect(release.contracts.createReservation).toBe(
        service.contracts.createReservation,
      );
      expect(release.system.createReservation).toBe(
        service.contracts.createReservation,
      );
      expect(
        Object.keys(release.contracts).filter(
          name => name === 'createReservation',
        ),
      ).toHaveLength(1);
      const selection = {
        kind: 'service' as const,
        serviceName: release.name,
        serviceVersion: version,
        actorName: service.name,
        actorVersion: service.version,
        sessionName: 'operator',
        claimsSchema: service.identity.claimsSchema,
        models: service.exposedModels,
        modelNames: Object.keys(service.exposedModels),
        contracts: service.contracts,
      };
      const locked = JSON.stringify(makeServiceSessionLock(selection));
      const noSystemGrant = makeServiceRelease(reservationsV1.definition, {
        version: version + 10,
        models: reservationsV1.models,
        actors: { operator: service },
        external: reservationsV1.external,
        contracts: reservationsV1.contracts,
      });
      expect(noSystemGrant.system).toEqual({});
      expect(
        JSON.stringify(
          makeServiceSessionLock({
            ...selection,
            actorName: noSystemGrant.actors.operator.name,
            actorVersion: noSystemGrant.actors.operator.version,
            models: noSystemGrant.actors.operator.exposedModels,
            contracts: noSystemGrant.actors.operator.contracts,
          }),
        ),
      ).toBe(locked);
    }
  });

  it('defers credentials projection failure until makeSystemSpec', () => {
    const operator = reservationsV1.actors.operator;
    const projectionError = new Error('Credentials projection failed');
    const credentialsSchema = Schema.String.check(
      Schema.makeFilter(() => true, {
        toJsonSchema: () => {
          throw projectionError;
        },
      }),
    );
    const actor = makeServiceActorRelease(
      { name: 'metadataFailure' },
      {
        version: 1,
        db: operator.db,
        exposedModels: operator.exposedModels,
        identity: operator.identity,
        authentication: {
          credentialsSchema,
          authenticate: () =>
            Effect.succeed({ viewerId: 'reader', department: 'sales' }),
        },
        contracts: operator.contracts,
        selections: operator.selections,
      },
    );
    const release = makeServiceRelease(reservationsV1.definition, {
      version: 2,
      models: reservationsV1.models,
      system: reservationsV1.system,
      external: reservationsV1.external,
      contracts: reservationsV1.contracts,
      actors: { metadataFailure: actor },
    });
    const system = makeSystem({
      name: 'metadataFailure',
      aggregates: {},
      services: { reservations: { releases: { 2: release } } },
    });
    expect(() => makeSystemSpec({ system })).toThrow(projectionError);
  });
});

describe('Complete SystemSpec', () => {
  it('binds projected reads to compatible release and Actor models', () => {
    const newer = upgradeModelVersion(reservationV1, {
      version: 2,
      attributes: { secret: primitives.text() },
    });
    const visible = makeLimitedModelVersion(
      { name: 'reservation', abbreviation: 'rsv' },
      {
        version: 2,
        attributes: { expiresAt: newer.attributes.expiresAt },
        indexes: [],
      },
    );
    const read = makeServiceContractRelease(
      defineServiceContract('readReservation'),
      {
        version: 1,
        payload: {},
        models: {
          reservation: { model: reservationV1, fields: ['expiresAt'] },
        },
        program: () => Effect.void,
      },
    );
    const readFromNewer = makeServiceContractRelease(
      defineServiceContract('readReservation'),
      {
        version: 1,
        payload: {},
        models: { reservation: { model: newer, fields: ['expiresAt'] } },
        program: () => Effect.void,
      },
    );
    expect(makeContractSpec(readFromNewer)).toEqual(makeContractSpec(read));
    const db = makeQueryDbVersion({ models: { reservation: newer } });
    const actor = makeServiceActorRelease(
      { name: 'limited' },
      {
        version: 1,
        db,
        exposedModels: { reservation: visible },
        identity: reservationsV1.actors.operator.identity,
        authentication: 'none',
        contracts: { readReservation: read },
        selections: { reservation: db.query.reservation.findMany() },
      },
    );
    const release = makeServiceRelease(
      { name: 'projected' },
      {
        version: 1,
        models: { reservation: newer },
        actors: { limited: actor },
        system: {},
        external: {},
      },
    );
    const olderRelease = makeServiceRelease(
      { name: 'projected' },
      {
        version: 2,
        rebuildFrom: release,
        models: { reservation: reservationV1 },
        actors: {},
        system: { readReservation: read },
        external: {},
      },
    );
    const system = makeSystem({
      name: 'projected',
      aggregates: {},
      services: {
        projected: { releases: { 1: release, 2: olderRelease } },
      },
    });
    const spec = makeSystemSpec({ system });
    expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
    const malformed = structuredClone(spec);
    const projectedField =
      malformed.services.projected?.contractVersions.readReservation?.[1]
        ?.models.reservation?.fields.expiresAt;
    if (projectedField === undefined) {
      throw new Error('Missing projected field');
    }
    Reflect.set(projectedField, 'nullable', true);
    expect(Schema.is(SystemSpecSchema)(malformed)).toBe(false);
    const missingId = structuredClone(spec);
    const projectedFields =
      missingId.services.projected?.contractVersions.readReservation?.[1]
        ?.models.reservation?.fields;
    if (projectedFields === undefined) {
      throw new Error('Missing projected fields');
    }
    Reflect.deleteProperty(projectedFields, 'id');
    expect(Schema.is(SystemSpecSchema)(missingId)).toBe(false);
    const incompatible = upgradeModelVersion(reservationV1, {
      version: 3,
      attributes: { expiresAt: primitives.integer({ nullable: true }) },
    });
    const badRelease = makeServiceRelease(
      { name: 'projected' },
      {
        version: 2,
        models: { reservation: incompatible },
        actors: {},
        system: { readReservation: read },
        external: {},
      },
    );
    expect(() =>
      makeSystem({
        name: 'incompatible',
        aggregates: {},
        services: { projected: { releases: { 2: badRelease } } },
      }),
    ).toThrow('reservation.expiresAt');
  });

  it('rejects changed inverse cardinality in native releases and portable specs', () => {
    const parent = defineModel({
      name: 'projectionParent',
      abbreviation: 'prp',
    });
    const child = defineModel({ name: 'projectionChild', abbreviation: 'prc' });
    const parentV1 = makeModelVersion(parent, {
      version: 1,
      attributes: {},
      indexes: [],
    });
    const childV1 = makeModelVersion(child, {
      version: 1,
      attributes: {
        parentId: modelRef({
          model: parent,
          relation: 'parent',
          inverse: 'children',
        }),
      },
      indexes: [],
    });
    const childV2 = upgradeModelVersion(childV1, {
      version: 2,
      attributes: {
        parentId: modelRef({
          model: parent,
          relation: 'parent',
          inverse: 'children',
          unique: true,
        }),
      },
    });
    const readMany = makeServiceContractRelease(
      defineServiceContract('readMany'),
      {
        version: 1,
        payload: {},
        models: {
          projectionParent: { model: parentV1, fields: [] },
          projectionChild: { model: childV1, fields: ['parentId'] },
        },
      },
    );
    const incompatible = makeServiceRelease(
      { name: 'relations' },
      {
        version: 1,
        models: { projectionParent: parentV1, projectionChild: childV2 },
        actors: {},
        system: { readMany },
        external: {},
      },
    );
    expect(() =>
      makeSystem({
        name: 'relations',
        aggregates: {},
        services: {
          relations: { releases: { 1: incompatible } },
        },
      }),
    ).toThrow('projectionChild.parentId');
    const readOne = makeServiceContractRelease(
      defineServiceContract('readOne'),
      {
        version: 1,
        payload: {},
        models: {
          projectionParent: { model: parentV1, fields: [] },
          projectionChild: { model: childV2, fields: ['parentId'] },
        },
      },
    );
    const release = makeServiceRelease(
      { name: 'relations' },
      {
        version: 1,
        models: { projectionParent: parentV1, projectionChild: childV2 },
        actors: {},
        system: { readOne },
        external: {},
      },
    );
    const spec = makeSystemSpec({
      system: makeSystem({
        name: 'relations',
        aggregates: {},
        services: { relations: { releases: { 1: release } } },
      }),
    });
    expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
    const field =
      spec.services.relations?.contractVersions.readOne?.[1]?.models
        .projectionChild?.fields.parentId;
    if (field === undefined) throw new Error('Missing projected reference');
    Reflect.set(field, 'unique', false);
    expect(Schema.is(SystemSpecSchema)(spec)).toBe(false);
  });

  it('retains Actor metadata and projects explicit System and external grants', () => {
    const system = makeSystem({
      name: 'actorMetadata',
      aggregates: { account: { releases: { 1: accountV1 } } },
      services: {
        reservations: { releases: { 1: reservationsV1 } },
      },
    });
    const spec = makeSystemSpec({ system });
    const viewer = spec.aggregates.account?.actorVersions.viewer?.[1];
    const reservations = spec.services.reservations;
    const operator = reservations?.actorVersions.operator?.[1];
    expect(viewer?.authentication).toHaveProperty('credentialsJsonSchema');
    expect(viewer?.identity.pattern).toBe('/:viewerId');
    expect(operator?.authentication).toBe('none');
    expect(operator?.contracts.createReservation).toBe(1);
    expect(operator?.selections.reservation?.modelName).toBe('reservation');
    expect(reservations?.contractVersions.createReservation?.[1]).toMatchObject(
      {
        commandName: 'createReservation',
        version: 1,
      },
    );
    expect(spec.aggregates.account?.releases[1]?.system.receiveCommand).toBe(1);
    expect(reservations?.releases[1]?.system.createReservation).toBe(1);
    expect(reservations?.releases[1]?.external.recordReservationWork).toBe(1);
    expect(spec.aggregates.account).not.toHaveProperty('canonical');
    expect(reservations).not.toHaveProperty('canonical');
    expect(reservations?.releases[1]?.models.reservation).toBe(1);
    expect(reservations?.releases[1]?.actors.operator).toBe(1);
    expect(reservations?.modelVersions.reservation?.[1]).toMatchObject({
      modelName: 'reservation',
      version: 1,
    });
    expect(
      reservations?.contractVersions.createReservation?.[1]?.operations,
    ).toContainEqual({
      operationName: 'create',
      model: { modelName: 'reservation', version: 1 },
    });
    const missingModel = structuredClone(spec);
    const modelOwner = missingModel.services.reservations;
    if (modelOwner === undefined) expect.fail('Missing reservations owner');
    Reflect.deleteProperty(modelOwner.modelVersions, 'reservation');
    expect(Schema.is(SystemSpecSchema)(missingModel)).toBe(false);
    const missingActor = structuredClone(spec);
    const actorOwner = missingActor.services.reservations;
    if (actorOwner === undefined) expect.fail('Missing reservations owner');
    Reflect.deleteProperty(actorOwner.actorVersions, 'operator');
    expect(Schema.is(SystemSpecSchema)(missingActor)).toBe(false);
    const wrongModelVersion = structuredClone(spec);
    const wrongModelRelease =
      wrongModelVersion.services.reservations?.releases[1];
    if (wrongModelRelease === undefined) {
      expect.fail('Missing reservations release');
    }
    Reflect.set(wrongModelRelease.models, 'reservation', 999);
    expect(Schema.is(SystemSpecSchema)(wrongModelVersion)).toBe(false);
    const missingExposure = structuredClone(spec);
    const projectedActor =
      missingExposure.services.reservations?.actorVersions.operator?.[1];
    const selection = Object.values(projectedActor?.selections ?? {})[0];
    if (projectedActor === undefined || selection === undefined) {
      expect.fail('Missing operator selection');
    }
    for (const modelName of ['constructor', '__proto__']) {
      Reflect.set(projectedActor, 'selections', {
        [modelName]: { ...selection, modelName },
      });
      expect(Schema.is(SystemSpecSchema)(missingExposure)).toBe(false);
      expect(
        Schema.is(SystemSpecSchema)({
          ...spec,
          serviceAgents: {
            reservations: {
              [modelName]: { serviceVersion: 1, agentVersion: 1 },
            },
          },
        }),
      ).toBe(false);
    }

    expect(spec.hash).toBe(hashSystemSpec(spec));
    expect(() =>
      Reflect.apply(makeSystem, null, [
        {
          name: 'obsoleteAggregateCanonical',
          aggregates: { account: { releases: { 1: accountV1 }, canonical: 1 } },
        },
      ]),
    ).toThrow(/canonical/);
    const config = makeConfig({ system, systemId: 'sys_actorMetadata' });
    expect(
      Schema.is(ZerospinConfigSchema)({
        ...config,
        system: {
          ...system,
          aggregates: {
            account: { ...system.aggregates.account, canonical: 1 },
          },
        },
      }),
    ).toBe(false);
    const obsoleteAggregateCanonical = structuredClone(spec);
    Reflect.set(obsoleteAggregateCanonical.aggregates.account!, 'canonical', 1);
    expect(
      Schema.decodeUnknownExit(SystemSpecSchema)(obsoleteAggregateCanonical, {
        onExcessProperty: 'error',
      })._tag,
    ).toBe('Failure');
    const missingPredecessor = structuredClone(spec);
    const releases = missingPredecessor.services.reservations?.releases;
    const first = releases?.[1];
    if (!releases || !first) expect.fail('Missing first Service release');
    Reflect.set(releases, 2, { ...first, version: 2 });
    expect(Schema.is(SystemSpecSchema)(missingPredecessor)).toBe(false);
  });

  it('validates contract references in unbound Actor and Agent definitions', () => {
    const spec = makeSystemSpec({
      system: makeSystem({
        name: 'unboundDefinitions',
        aggregates: {},
        services: {
          reservations: { releases: { 1: reservationsV1 } },
        },
      }),
    });
    const owner = spec.services.reservations;
    const operator = owner?.actorVersions.operator?.[1];
    const release = owner?.releases[1];
    if (
      owner === undefined ||
      operator === undefined ||
      release === undefined
    ) {
      expect.fail('Missing reservations metadata');
    }
    const actor = {
      ...operator,
      version: 99,
      contracts: { createReservation: 1 },
    };
    const agent = {
      name: 'reviewer',
      agentVersion: 99,
      sessionName: 'reviewer',
      selectionSemantics: 'selected-rows',
      models: Object.fromEntries(
        Object.keys(release.models).map(name => [
          name,
          owner.modelVersions[name]![release.models[name]!]!,
        ]),
      ),
      contracts: { createReservation: 1 },
      ownerReleaseVersion: 1,
      wakeRules: {},
      selections: {},
    };
    const candidate = {
      ...spec,
      services: {
        reservations: {
          ...owner,
          actorVersions: {
            ...owner.actorVersions,
            operator: { ...owner.actorVersions.operator, 99: actor },
          },
          agentVersions: { ...owner.agentVersions, reviewer: { 99: agent } },
        },
      },
    };
    expect(Schema.is(SystemSpecSchema)(candidate)).toBe(true);
    for (const contracts of [actor.contracts, agent.contracts]) {
      contracts.createReservation = 999;
      expect(Schema.is(SystemSpecSchema)(candidate)).toBe(false);
      contracts.createReservation = 1;
    }
  });

  it('captures every replay codec while keeping exact release bindings', () => {
    const claims = Schema.Struct({ userId: Schema.String });
    const v1 = makeServiceContractRelease(
      defineServiceContract('recordReceipt'),
      {
        version: 1,
        payload: { value: primitives.integer() },
        claims,
      },
    );
    const v2 = upgradeServiceContractRelease(v1, {
      version: 2,
      payload: { value: primitives.text() },
      up: props => {
        const { payload } = props;
        return Effect.succeed({ value: String(payload.value) });
      },
    });
    const actor = makeServiceActorRelease(
      { name: 'reader' },
      {
        version: 1,
        db: makeQueryDbVersion({ models: {} }),
        exposedModels: {},
        identity: makeActorIdentity({
          claims,
          actorPath: RoutePattern.parse('/:userId'),
        }),
        authentication: 'none',
        selections: {},
        contracts: { recordReceipt: v2 },
      },
    );
    const invalidSystemGrant = makeServiceRelease(
      { name: 'receiptHistory' },
      { version: 1, models: {}, system: { recordReceipt: v2 } },
    );
    expect(() =>
      makeSystem({
        name: 'invalidGrant',
        aggregates: {},
        services: {
          receiptHistory: { releases: { 1: invalidSystemGrant } },
        },
      }),
    ).toThrow(/claims-free/);
    const oldRelease = makeServiceRelease(
      { name: 'receiptHistory' },
      {
        version: 2,
        models: {},
        actors: { reader: actor },
      },
    );
    const invalidAgent = makeServiceAgentRelease({
      serviceName: 'receiptHistory',
      serviceVersion: 2,
      agentName: 'invalid',
      agentVersion: 1,
      sessionName: 'invalid',
      db: actor.db,
      selections: {},
      contracts: {
        // @ts-expect-error Agents cannot invoke a claims-bearing Actor contract.
        recordReceipt: makeAgentCommandRef<typeof v2>('recordReceipt', 2),
      },
    });
    expect(() =>
      makeSystem({
        name: 'invalidAgentGrant',
        aggregates: {},
        services: {
          receiptHistory: { releases: { 2: oldRelease } },
        },
        serviceAgents: {
          receiptHistory: {
            invalid: { releases: { 1: invalidAgent }, active: 1 },
          },
        },
      }),
    ).toThrow(/recordReceipt@2 must be a claims-free ordinary contract/);
    const v3 = upgradeServiceContractRelease(v2, { version: 3 });
    const release = makeServiceRelease(
      { name: 'receiptHistory' },
      {
        version: 3,
        models: {},
        actors: {
          reader: updateServiceActorRelease(actor, {
            version: 2,
            contracts: { recordReceipt: v3 },
          }),
        },
      },
    );
    const system = makeSystem({
      name: 'history',
      aggregates: {},
      services: { receiptHistory: { releases: { 3: release } } },
    });
    const spec = makeSystemSpec({ system });
    const owner = spec.services.receiptHistory;
    const versions = owner?.contractVersions.recordReceipt;
    const historical = versions?.[1];
    const selected = versions?.[3];
    if (
      owner === undefined ||
      versions === undefined ||
      historical === undefined ||
      selected === undefined
    ) {
      throw new Error('Expected every compiled recordReceipt version');
    }
    expect(Object.keys(versions)).toEqual(['1', '2', '3']);
    expect(owner.releases[3]?.contracts.recordReceipt).toBe(3);
    expect(historical.payloadShape).not.toEqual(selected.payloadShape);
    expect(historical.claimsJsonSchema).toEqual(
      Schema.toJsonSchemaDocument(claims),
    );
    expect(selected).not.toHaveProperty('payloadShapes');
    expect(selected).not.toHaveProperty('failureSchemas');
    expect(selected).not.toHaveProperty('previous');
    expect(Object.isFrozen(historical.payloadShape)).toBe(false);
    expect(oldRelease.actors.reader).toBe(actor);
    expect(actor.contracts.recordReceipt).toBe(v2);
    expect(() => upgradeServiceContractRelease(v3, { version: 4 })).toThrow();
    expect(makeSystemSpec({ system }).hash).toBe(spec.hash);

    // Reusing the finalized graph is valid; an older release sees its descendant codecs.
    const older = makeSystemSpec({
      system: makeSystem({
        name: 'history',
        aggregates: {},
        services: {
          receiptHistory: { releases: { 2: oldRelease } },
        },
      }),
    });
    const olderOwner = older.services.receiptHistory;
    const olderVersions = olderOwner?.contractVersions.recordReceipt;
    if (olderVersions === undefined) {
      throw new Error('Expected descendant codecs for the older release');
    }
    expect(Object.keys(olderVersions)).toEqual(['1', '2', '3']);
    expect(olderOwner?.releases[2]?.contracts.recordReceipt).toBe(2);
    expect(
      olderOwner?.actorVersions.reader?.[actor.version]?.contracts
        .recordReceipt,
    ).toBe(2);
    expect(actor.contracts.recordReceipt).toBe(v2);
  });

  it('retains an own __proto__ contract name through compilation and decoding', () => {
    const contract = makeServiceContractRelease(
      defineServiceContract('__proto__'),
      { version: 1, payload: {} },
    );
    const release = makeServiceRelease(
      { name: 'prototypeNames' },
      { version: 1, models: {}, system: { ['__proto__']: contract } },
    );
    const spec = makeSystemSpec({
      system: makeSystem({
        name: 'prototypeNames',
        aggregates: {},
        services: {
          prototypeNames: { releases: { 1: release } },
        },
      }),
    });
    const owner = spec.services.prototypeNames;
    if (owner === undefined) expect.fail('Missing prototypeNames metadata');
    expect(Object.hasOwn(owner.contractVersions, '__proto__')).toBe(true);
    expect(owner.contractVersions['__proto__']?.[1]?.commandName).toBe(
      '__proto__',
    );
    expect(Object.hasOwn(owner.releases[1]?.contracts ?? {}, '__proto__')).toBe(
      true,
    );
    expect(owner.releases[1]?.system['__proto__']).toBe(1);
    const decoded = Schema.decodeUnknownSync(SystemSpecSchema)(
      JSON.parse(JSON.stringify(spec)),
      { onExcessProperty: 'error' },
    );
    expect(decoded).toEqual(spec);
    expect(hashSystemSpec(decoded)).toBe(spec.hash);
  });

  it('hashes canonical complete JSON and preserves external schema facts', () => {
    const spec = makeSystemSpec({
      system: makeSystem({
        name: 'receiptMetadata',
        aggregates: {},
        services: {
          receipts: { releases: { 1: receiptsServiceReleaseV1 } },
        },
      }),
    });
    const owner = spec.services.receipts;
    const external = owner?.contractVersions.sendExternalReceipt?.[1];
    if (owner === undefined || external === undefined) {
      throw new Error('Expected complete external contract metadata');
    }
    expect(external.external).toEqual({
      responseJsonSchema: Schema.toJsonSchemaDocument(
        sendExternalReceiptV1.external.response,
      ),
      timeoutMs: sendExternalReceiptV1.external.timeoutMs,
      onSuccess: { commandName: 'recordReceiptDelivery', version: 1 },
      onFailure: { commandName: 'recordReceiptDelivery', version: 1 },
    });
    expect(external.claimsJsonSchema).toBe(null);
    expect(
      Schema.decodeUnknownSync(SystemSpecSchema)(
        JSON.parse(JSON.stringify(spec)),
      ),
    ).toEqual(spec);
    const reordered = JSON.parse(
      JSON.stringify(spec, (_key, value: unknown) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value)
        ) {
          return value;
        }
        return Object.fromEntries(
          Object.keys(value)
            .reverse()
            .map(key => [key, Reflect.get(value, key)]),
        );
      }),
    );
    expect(hashSystemSpec(reordered)).toBe(spec.hash);
    expect(hashSystemSpec({ ...spec, systemName: 'changed' })).not.toBe(
      spec.hash,
    );
    expect(hashSystemSpec({ ...spec, hash: 'ignored' })).toBe(spec.hash);
    const orderedWire = JSON.parse(JSON.stringify(spec));
    orderedWire.services.receipts.contractVersions.sendExternalReceipt[1].resultJsonSchema =
      { enum: ['one', 'two'] };
    const reversedWire = JSON.parse(JSON.stringify(orderedWire));
    reversedWire.services.receipts.contractVersions.sendExternalReceipt[1].resultJsonSchema.enum.reverse();
    expect(
      hashSystemSpec(Schema.decodeUnknownSync(SystemSpecSchema)(orderedWire)),
    ).not.toBe(
      hashSystemSpec(Schema.decodeUnknownSync(SystemSpecSchema)(reversedWire)),
    );
    expect(Object.isFrozen(spec)).toBe(false);
    expect(Object.isFrozen(owner.contractVersions)).toBe(false);
    expect(() =>
      Schema.decodeUnknownSync(ContractSpecSchema)({
        ...external,
        resultJsonSchema: () => undefined,
      }),
    ).toThrow();
    const invalid = { ...spec, queries: {} };
    const before = JSON.stringify(invalid);
    expect(() =>
      Schema.decodeUnknownSync(SystemSpecSchema)(invalid, {
        onExcessProperty: 'error',
      }),
    ).toThrow();
    expect(JSON.stringify(invalid)).toBe(before);
  });

  it('does not finalize failed compositions or hash an unfinalized graph', () => {
    const contract = makeServiceContractRelease(
      defineServiceContract('recordReceipt'),
      {
        version: 1,
        payload: {},
      },
    );
    const release = makeServiceRelease(
      { name: 'receiptHistory' },
      { version: 1, models: {}, system: { recordReceipt: contract } },
    );
    const unfinalized = {
      name: 'history',
      aggregates: {},
      services: { receiptHistory: { releases: { 1: release } } },
      aggregateAgents: {},
      serviceAgents: {},
    };
    expect(() => makeSystemSpec({ system: unfinalized })).toThrow();
    expect(() =>
      makeSystem({
        name: 'history',
        aggregates: {},
        // @ts-expect-error The runtime also rejects the wrong owner registry key.
        services: { different: { releases: { 1: release } } },
      }),
    ).toThrow();
    expect(() =>
      upgradeServiceContractRelease(contract, { version: 2 }),
    ).not.toThrow();
  });
});

describe('SDK query responses', () => {
  it.effect(
    'maps positional rows and rejects mismatched or malformed wire results',
    () =>
      Effect.gen(function* () {
        const recordedAt = new Date('2026-10-17T12:00:00Z');
        const queries = makeQueryDbVersion({
          models: receiptsServiceReleaseV1.models,
        });
        const columns = { createdAt: true, id: true, recipient: true } as const;
        const selection = queries.query.receipt.findMany({ columns });
        const read = selection.prepareRead();
        const response = {
          compilerVersion: read.compilerVersion,
          layout: read.layout,
          rows: [[recordedAt.getTime(), 'rcp_read', 'reader@example.com']],
        };
        const unexpected = () => Effect.die('Unexpected administrative call');
        const rpc: IApi<ISystemApiRpc> = {
          healthcheck: unexpected,
          initialize: unexpected,
          executeServiceQuery: () => Effect.succeed(response),
          executeAggregateQuery: () => Effect.succeed(response),
          executeAggregateCommand: unexpected,
          executeServiceCommand: unexpected,
          getRepoRegistrations: unexpected,
          getRepoTableRows: unexpected,
          preflightDeployment: unexpected,
          acceptSystemSpec: unexpected,
          getExecutingWorkerVersion: unexpected,
          makeSystemSpec: unexpected,
          openAggregateAgentSession: unexpected,
          openServiceAgentSession: unexpected,
          getAgentAggregateIds: unexpected,
        };
        const commands: { payload: string }[] = [];
        const serviceCommands: { payload: string }[] = [];
        let attempts = 0;
        const administrative = makeSystemApi({
          rpc: {
            ...rpc,
            executeAggregateCommand: ({ command }) => {
              commands.push(command);
              return Effect.succeed({
                result: { _tag: 'Success' as const, success: null },
                finalizedAt: recordedAt,
              });
            },
            executeServiceCommand: ({ command }) =>
              Effect.suspend(() => {
                serviceCommands.push(command);
                attempts += 1;
                return attempts === 1
                  ? encodeError(
                      makeZerospinError('rpc-invocation-failed'),
                    ).pipe(Effect.flatMap(Effect.fail))
                  : Effect.succeed({
                      result: { _tag: 'Success' as const, success: null },
                      finalizedAt: recordedAt,
                    });
              }),
          },
        });
        const input = {
          contractName: 'requestReceipt' as const,
          payload: {
            receiptId: 'rcp_prepared' as const,
            recipient: 'original@example.com',
          },
        };
        const operation = administrative.executeServiceCommand(
          receiptsServiceReleaseV1,
          input,
        );
        input.payload.recipient = 'changed@example.com';
        const outcome = yield* operation.pipe(Effect.retry({ times: 1 }));
        expect(outcome.finalizedAt).toBe(recordedAt);
        expect(serviceCommands).toHaveLength(2);
        expect(serviceCommands[0]).not.toHaveProperty('id');
        expect(serviceCommands[0]).toEqual(serviceCommands[1]);
        yield* operation;
        expect(serviceCommands).toHaveLength(3);
        expect(serviceCommands[2]).toEqual(serviceCommands[0]);
        expect(serviceCommands[0]).toMatchObject({
          payload: JSON.stringify({
            receiptId: 'rcp_prepared',
            recipient: 'original@example.com',
          }),
        });
        yield* administrative.executeAggregateCommand(accountV1, {
          aggregateId: 'acc_one',
          contractName: 'receiveCommand',
          payload: {},
        });
        expect(commands).toMatchObject([
          {
            aggregateName: 'account',
            aggregateVersion: 1,
            aggregateId: 'acc_one',
            commandName: 'receiveCommand',
            kind: 'system',
            payload: '{}',
          },
        ]);
        for (const contractName of ['sendExternalReceipt', 'toString']) {
          const forbiddenOperation: ReturnType<
            typeof administrative.executeServiceCommand
          > = Reflect.apply(
            administrative.executeServiceCommand,
            administrative,
            [receiptsServiceReleaseV1, { contractName, payload: {} }],
          );
          const forbidden = yield* forbiddenOperation.pipe(Effect.flip);
          expect(forbidden).toMatchObject({
            code: 'administrative-contract-unavailable',
          });
          expect(serviceCommands).toHaveLength(3);
        }
        const api = makeSystemApi({ rpc });
        const rows = yield* api.executeServiceQuery({
          serviceName: 'receipts',
          serviceVersion: 1,
          query: selection,
        });
        expect(rows).toEqual([
          {
            id: 'rcp_read',
            recipient: 'reader@example.com',
            createdAt: recordedAt,
          },
        ]);
        const empty = makeSystemApi({
          rpc: {
            ...rpc,
            executeServiceQuery: () =>
              Effect.succeed({ ...response, rows: [] }),
          },
        });
        expect(
          yield* empty.executeServiceQuery({
            serviceName: 'receipts',
            serviceVersion: 1,
            query: queries.query.receipt.findFirst({ columns }),
          }),
        ).toBeUndefined();
        expect(
          yield* empty.executeServiceQuery({
            serviceName: 'receipts',
            serviceVersion: 1,
            query: selection,
          }),
        ).toEqual([]);
        const mismatch = makeSystemApi({
          rpc: {
            ...rpc,
            executeServiceQuery: () =>
              Effect.succeed({ ...response, compilerVersion: 'different' }),
            executeAggregateQuery: () =>
              Effect.succeed({ ...response, layout: [] }),
          },
        });
        const mismatched = yield* mismatch
          .executeServiceQuery({
            serviceName: 'receipts',
            serviceVersion: 1,
            query: selection,
          })
          .pipe(Effect.flip);
        expect(mismatched).toMatchObject({
          code: 'service-query-result-mismatch',
        });
        const aggregateQuery = {
          aggregateName: 'receiptArchive',
          aggregateVersion: 1,
          aggregateId: 'archive_one',
          query: selection,
        };
        expect(yield* api.executeAggregateQuery(aggregateQuery)).toEqual(rows);
        expect(
          yield* mismatch
            .executeAggregateQuery(aggregateQuery)
            .pipe(Effect.flip),
        ).toMatchObject({ code: 'aggregate-query-result-mismatch' });
        const malformed = makeSystemApi({
          rpc: {
            ...rpc,
            executeServiceQuery: () =>
              Effect.succeed({ ...response, extra: 'invalid' }),
          },
        });
        expect(
          yield* malformed
            .executeServiceQuery({
              serviceName: 'receipts',
              serviceVersion: 1,
              query: selection,
            })
            .pipe(Effect.flip),
        ).toMatchObject({ code: 'rpc-invalid-response' });
        expect(() =>
          Schema.decodeUnknownSync(ServiceQuerySchema)(
            {
              serviceName: 'receipts',
              serviceVersion: 1,
              queryName: 'legacy',
              params: {},
            },
            { onExcessProperty: 'error' },
          ),
        ).toThrow();
      }),
  );
});

it.effect(
  'loads the Shopping seed program sequentially and reports void completion',
  () =>
    Effect.gen(function* () {
      const cwd = fileURLToPath(
        new URL('../../../../examples/shopping/', import.meta.url),
      );
      const fileSystem = FileSystem.makeNoop({
        exists: filePath => Effect.sync(() => existsSync(filePath)),
        readFileString: filePath =>
          Effect.sync(() => readFileSync(filePath, 'utf8')),
      });
      seedMocks.config = {
        zerospinApiUrl: 'https://seeds.example',
        zerospinSecretKey: 'seed-secret',
      };
      const commands: { payload: string }[] = [];
      let mode: 'success' | 'businessFailure' | 'defect' = 'success';
      const unexpected = () => Effect.die('Unexpected seed RPC');
      seedMocks.rpc = {
        healthcheck: unexpected,
        initialize: unexpected,
        executeServiceQuery: unexpected,
        executeAggregateQuery: unexpected,
        executeAggregateCommand: unexpected,
        executeServiceCommand: ({ command }) =>
          Effect.suspend(() => {
            commands.push(command);
            if (mode === 'defect') {
              return Effect.die(new Error('Seed transport failed'));
            }
            return Effect.succeed({
              result:
                mode === 'businessFailure' && commands.length === 3
                  ? {
                      _tag: 'Failure' as const,
                      failure: {
                        _tag: 'ZerospinError' as const,
                        code: 'product-price-invalid',
                        message: 'Fixture seed refusal',
                        status: null,
                        extra: null,
                      },
                    }
                  : { _tag: 'Success' as const, success: null },
              finalizedAt: new Date(1_000),
            });
          }),
        getRepoRegistrations: unexpected,
        getRepoTableRows: unexpected,
        preflightDeployment: unexpected,
        acceptSystemSpec: unexpected,
        getExecutingWorkerVersion: unexpected,
        makeSystemSpec: unexpected,
        openAggregateAgentSession: unexpected,
        openServiceAgentSession: unexpected,
        getAgentAggregateIds: unexpected,
      };
      const run = seedFn({ cwd, filePath: './src/zerospin/seeds.ts' }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
      );
      expect(yield* run).toBeUndefined();
      expect(commands).toHaveLength(12);
      expect(commands.every(command => !('id' in command))).toBe(true);
      const original = [...commands];
      commands.length = 0;
      yield* run;
      expect(commands).toEqual(original);
      commands.length = 0;
      mode = 'businessFailure';
      expect(yield* run.pipe(Effect.flip)).toMatchObject({
        code: 'seed-submit-failed',
      });
      expect(commands).toHaveLength(3);
      commands.length = 0;
      mode = 'defect';
      expect(yield* run.pipe(Effect.flip)).toMatchObject({
        code: 'seed-submit-failed',
      });
      expect(commands).toHaveLength(1);
      const loaderFailure = seedFn({
        cwd,
        filePath: '../../packages/cli/README.md',
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(Path.layer),
        Effect.flip,
      );
      expect(yield* loaderFailure).toMatchObject({ code: 'seed-load-failed' });
      const completed = renderToStaticMarkup(
        createElement(Seed, { args: ['./src/zerospin/seeds.ts'] }),
      );
      expect(completed).toContain('Seed program completed');
      expect(completed).not.toContain('commands submitted');
    }),
);
