import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { makeReleaseSpec } from '@zerospin/core/declaration/makeReleaseSpec';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import {
  getOwnerReleaseBindingName,
  getOwnerReleaseWorkerName,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import {
  ChildProcessSpawner,
  make as makeChildProcessSpawner,
} from 'effect/process/ChildProcessSpawner';
import type * as Scope from 'effect/Scope';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { deployWranglerFn } from '../dist/deploy/deployWranglerFn.js';
import { bootstrapRecord } from '../dist/deploy/utils/bootstrapRecord.js';
import type {
  ICandidateDeployment,
  IDeploymentProject,
  IWorkerDeployment,
} from '../dist/deploy/utils/deploymentTypes.js';
import { loadDeploymentProject } from '../dist/deploy/utils/loadDeploymentProject.js';
import { openRemoteWorkerBinding } from '../dist/deploy/utils/openRemoteWorkerBinding.js';
import { openWranglerDeploymentWorkspace } from '../dist/deploy/utils/openWranglerDeploymentWorkspace.js';
import { prepareBootstrapUpload } from '../dist/deploy/utils/prepareBootstrapUpload.js';
import { prepareOwnerReleaseBindings } from '../dist/deploy/utils/prepareOwnerReleaseBindings.js';
import * as candidatePreparation from '../dist/deploy/utils/prepareSystemWorkerCandidate.js';
import * as promotion from '../dist/deploy/utils/promoteSystemWorkerUpdate.js';
import {
  publishWranglerWorkerVersion,
  runWranglerCommand,
} from '../dist/deploy/utils/runWranglerCommand.js';
import * as staging from '../dist/deploy/utils/stageSystemWorkerUpdate.js';
import { systemTrafficRecord } from '../dist/deploy/utils/systemTrafficRecord.js';
import { uploadInitialSystemWorker } from '../dist/deploy/utils/uploadInitialSystemWorker.js';
import { verifyServingSystem } from '../dist/deploy/utils/verifyServingSystem.js';

const systemApi = vi.hoisted(() => ({
  preflightDeployment: vi.fn(),
  makeSystemSpec: vi.fn(),
  acceptSystemSpec: vi.fn(),
  getExecutingWorkerVersion: vi.fn(),
  initialize: vi.fn(),
}));
const { preflightDeployment } = systemApi;
vi.mock('@zerospin/core/utils/getApi/getApi', () => ({
  getApi: () => () => Effect.succeed(systemApi),
}));

vi.mock('../dist/deploy/utils/openRemoteWorkerBinding.js', () => ({
  openRemoteWorkerBinding: vi.fn(),
}));
vi.mock('../dist/deploy/utils/prepareBootstrapUpload.js', () => ({
  prepareBootstrapUpload: vi.fn(),
}));
vi.mock('../dist/deploy/utils/loadDeploymentProject.js', () => ({
  loadDeploymentProject: vi.fn(),
}));
vi.mock('../dist/deploy/utils/runWranglerCommand.js', () => ({
  publishWranglerWorkerVersion: vi.fn(),
  runWranglerCommand: vi.fn(),
}));

let project: IDeploymentProject;

beforeEach(async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'zerospin-deploy-test-'));
  const configModulePath = path.join(cwd, 'zerospin.config.ts');
  const system = makeSystem({ name: 'recovery-test', aggregates: {} });
  const config = makeConfig({ system, systemId: 'sys_recovery_test' });
  project = {
    cwd,
    wranglerBinPath: path.join(cwd, 'wrangler.js'),
    configModulePath,
    generatedConfig: makeWranglerConfig({
      config,
      configModulePath,
      main: path.join(cwd, 'SystemWorker.js'),
      environment: 'production',
    }),
    systemSpec: makeSystemSpec({ system }),
    applicationBindings: undefined,
    agentWorkerMain: '',
    aggregateReleaseWorkerMain: '',
    serviceReleaseWorkerMain: '',
    ownerReleases: [],
    keys: { publishableKey: 'test-publishable', secretKey: 'test-secret' },
    telemetrySecretBindingNames: [],
    telemetrySecrets: {},
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await fs.rm(project.cwd, { recursive: true, force: true });
});

function wranglerJson(value: unknown) {
  return Effect.succeed({
    stdout: JSON.stringify(value),
    records: [],
    workerAbsent: false,
  });
}

function runDeployment<A, E>(
  program: Effect.Effect<A, E, ChildProcessSpawner | Scope.Scope>,
) {
  return Effect.runPromise(
    Effect.scoped(program).pipe(
      Effect.provideService(
        ChildProcessSpawner,
        makeChildProcessSpawner(() =>
          Effect.die(new Error('Unexpected Wrangler subprocess')),
        ),
      ),
    ),
  );
}

it('reuses the tagged serving version on rerun after losing the upload response', async () => {
  const accountId = 'f'.repeat(32);
  const versionId = randomUUID();
  const serving = {
    id: randomUUID(),
    created_on: '2026-11-20T00:00:00Z',
    versions: [{ version_id: versionId, percentage: 100 }],
  };
  const compileBootstrap = vi.mocked(prepareBootstrapUpload);
  compileBootstrap.mockReturnValue(
    Effect.succeed({
      body: new Uint8Array(),
      contentType: 'multipart/form-data',
    }),
  );
  const wrangler = vi.mocked(runWranglerCommand);
  const credentials = wranglerJson({ type: 'api_token', token: 'fake-token' });
  const cloudflare = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', cloudflare);

  const originalRunId = await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      const record = bootstrapRecord(workspace, accountId);
      wrangler
        .mockReturnValueOnce(credentials)
        .mockReturnValueOnce(
          Effect.fail(makeZerospinError('zerospin-wrangler-exited')),
        );
      cloudflare
        .mockResolvedValueOnce(
          Response.json(
            { success: false, result: null, errors: [{ code: 10007 }] },
            { status: 404 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ success: true, result: [], errors: [] }),
        )
        .mockRejectedValueOnce(new Error('The PUT response was lost'));

      const result = yield* Effect.result(
        uploadInitialSystemWorker(workspace, accountId, record, false),
      );
      expect(result).toMatchObject({
        failure: { code: 'zerospin-bootstrap-upload-pending' },
      });
      expect(yield* record.read).toEqual({
        runId: workspace.runId,
        systemId: 'sys_recovery_test',
      });
      return workspace.runId;
    }),
  );

  await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      const record = bootstrapRecord(workspace, accountId);
      const pending = yield* record.read;
      if (!pending) throw new Error('Expected a saved initial upload');
      workspace.runId = pending.runId;
      wrangler
        .mockReturnValueOnce(credentials)
        .mockReturnValueOnce(wranglerJson(serving))
        .mockReturnValueOnce(
          wranglerJson({
            id: versionId,
            annotations: { 'workers/tag': originalRunId },
            resources: { bindings: [] },
          }),
        );
      cloudflare.mockResolvedValueOnce(
        Response.json({
          success: true,
          result: { enabled: false, previews_enabled: false },
          errors: [],
        }),
      );

      expect(
        yield* uploadInitialSystemWorker(workspace, accountId, record, true),
      ).toEqual(serving);
      expect(yield* record.read).toEqual({ ...pending, versionId });
    }),
  );

  expect(compileBootstrap).toHaveBeenCalledTimes(1);
  expect(
    cloudflare.mock.calls.map(([, request]) => request?.method ?? 'GET'),
  ).toEqual(['GET', 'GET', 'PUT', 'GET']);
  expect(wrangler.mock.calls.at(-1)?.[1]).toEqual([
    'versions',
    'view',
    versionId,
    '--json',
  ]);
});

it('refuses promotion when the zero-traffic deployment ID has changed', async () => {
  const candidate: ICandidateDeployment = {
    workerName: project.generatedConfig.name,
    versionId: randomUUID(),
    incumbentVersionId: randomUUID(),
    stagedDeploymentId: randomUUID(),
  };
  const replacedStage: IWorkerDeployment = {
    id: randomUUID(),
    created_on: '2026-11-20T00:00:00Z',
    annotations: { 'workers/message': 'stage-marker' },
    versions: [
      { version_id: candidate.incumbentVersionId, percentage: 100 },
      { version_id: candidate.versionId, percentage: 0 },
    ],
  };
  const wrangler = vi.mocked(runWranglerCommand);
  wrangler.mockReturnValueOnce(wranglerJson(replacedStage));
  const result = await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      return yield* Effect.result(
        promotion.promoteSystemWorkerUpdate(
          workspace,
          candidate,
          systemTrafficRecord(workspace, 'f'.repeat(32)),
          {
            specHash: project.systemSpec.hash,
            ownerReleases: [],
            agentVersionId: 'agent-candidate',
            agentPriorDeploymentId: 'agent-incumbent',
          },
        ),
      );
    }),
  );

  expect(result).toMatchObject({
    failure: { code: 'zerospin-deployment-changed' },
  });
  expect(wrangler.mock.calls.map(([, args]) => args)).toEqual([
    ['deployments', 'status', '--json'],
  ]);
});

it('replaces a zero-traffic candidate with the version built from disk', async () => {
  const incumbentVersionId = randomUUID();
  const versionId = randomUUID();
  const incumbent: IWorkerDeployment = {
    id: randomUUID(),
    created_on: '2026-11-20T00:00:00Z',
    annotations: { 'workers/message': 'zerospin-preflight-' + randomUUID() },
    versions: [
      { version_id: incumbentVersionId, percentage: 100 },
      { version_id: randomUUID(), percentage: 0 },
    ],
  };
  const stagedDeploymentId = randomUUID();
  const versions = [
    { version_id: incumbentVersionId, percentage: 100 },
    { version_id: versionId, percentage: 0 },
  ];
  const publishVersion = vi.mocked(publishWranglerWorkerVersion);
  publishVersion.mockReturnValue(Effect.succeed(versionId));
  const wrangler = vi.mocked(runWranglerCommand);

  await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      const record = systemTrafficRecord(workspace, 'f'.repeat(32));
      let observed = incumbent;
      wrangler.mockImplementation((_, args) => {
        if (args[0] === 'deployments') return wranglerJson(observed);
        return Effect.gen(function* () {
          const message = args.at(-1);
          if (!message) throw new Error('Expected a stage annotation');
          expect(message).toMatch(/^zerospin-stage-/);
          expect(args).toEqual([
            'versions',
            'deploy',
            `${incumbentVersionId}@100%`,
            `${versionId}@0%`,
            '--yes',
            '--message',
            message,
          ]);
          expect(yield* record.read.pipe(Effect.orDie)).toEqual({
            phase: 'stage',
            priorDeploymentId: incumbent.id,
            message,
            versions,
          });
          observed = {
            ...incumbent,
            id: stagedDeploymentId,
            annotations: { 'workers/message': message },
            versions: versions.toReversed(),
          };
          return { stdout: '', records: [], workerAbsent: false };
        });
      });

      expect(
        yield* staging.stageSystemWorkerUpdate(workspace, incumbent, record),
      ).toEqual({
        workerName: project.generatedConfig.name,
        versionId,
        incumbentVersionId,
        stagedDeploymentId,
      });
    }),
  );
  expect(publishVersion).toHaveBeenCalledTimes(1);
  expect(wrangler.mock.calls.at(-1)?.[1]).toEqual([
    'deployments',
    'status',
    '--json',
  ]);
});

it('stops before writing when a previous promotion is still ambiguous', async () => {
  const accountId = 'f'.repeat(32);
  const candidate = randomUUID();
  const staged: IWorkerDeployment = {
    id: randomUUID(),
    created_on: '2026-11-20T00:00:00Z',
    versions: [
      { version_id: randomUUID(), percentage: 100 },
      { version_id: candidate, percentage: 0 },
    ],
  };
  await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      yield* systemTrafficRecord(workspace, accountId).write({
        phase: 'promote',
        priorDeploymentId: staged.id,
        message: 'unconfirmed-promotion',
        versions: [{ version_id: candidate, percentage: 100 }],
      });
    }),
  );
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', accountId);
  vi.mocked(loadDeploymentProject).mockReturnValue(
    Effect.succeed({ kind: 'project', project }),
  );
  const wrangler = vi.mocked(runWranglerCommand);
  wrangler.mockReturnValueOnce(wranglerJson(staged));

  expect(await runDeployment(Effect.result(deployWranglerFn()))).toMatchObject({
    failure: { code: 'zerospin-system-traffic-write-pending' },
  });
  expect(wrangler.mock.calls.map(([, args]) => args)).toEqual([
    ['deployments', 'status', '--json'],
  ]);
});

it.each([
  'accepted',
  'provisional',
  'unresolved',
  'stale',
  'mismatch',
  'lost reply',
] as const)(
  'reconciles the %s owner Worker after an interrupted deploy from an older SystemSpec',
  async state => {
    const accountId = 'f'.repeat(32);
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', accountId);
    const release = { serviceName: 'orders', serviceVersion: 1 };
    const definition = defineService({ name: 'orders' });
    const orders = makeServiceRelease(definition, {
      version: 1,
      models: {},
    });
    const system = makeSystem({
      name: 'recovery-test',
      aggregates: {},
      services: { orders: { releases: { 1: orders } } },
    });
    const olderSpec = makeSystemSpec({ system });
    const customer = makeModelVersion(
      defineModel({ name: 'customer', abbreviation: 'cst' }),
      {
        version: 1,
        attributes: { label: primitives.text() },
        indexes: [],
      },
    );
    const updated =
      state === 'accepted'
        ? orders
        : makeServiceRelease(definition, {
            version: 1,
            models: { customer },
          });
    const audit = makeServiceRelease(defineService({ name: 'audit' }), {
      version: 1,
      models: {},
    });
    project.systemSpec = makeSystemSpec({
      system: makeSystem({
        ...system,
        services: {
          ...system.services,
          orders: { releases: { 1: updated } },
          audit: { releases: { 1: audit } },
        },
      }),
    });
    project.ownerReleases = [
      {
        release,
        releaseSpec: makeReleaseSpec(updated),
        source: {
          modulePath: path.join(project.cwd, 'orders.ts'),
          exportName: 'orders',
        },
      },
    ];
    const pin = {
      systemId: 'sys_recovery_test',
      release,
      versionId: randomUUID(),
      specHash: olderSpec.hash,
    };
    const nextVersionId = randomUUID();
    const olderRunId = randomUUID();
    const serving = (versionId: string) => ({
      id: randomUUID(),
      created_on: '2026-11-20T00:00:00Z',
      versions: [{ version_id: versionId, percentage: 100 }],
    });
    let observed = serving(pin.versionId);
    const wrangler = vi.mocked(runWranglerCommand);
    wrangler.mockImplementation((_, args) =>
      args[0] === 'deployments'
        ? wranglerJson(observed)
        : wranglerJson({
            id: pin.versionId,
            annotations: {
              'workers/tag': state === 'unresolved' ? randomUUID() : olderRunId,
            },
            resources: { bindings: [] },
          }),
    );
    vi.mocked(openRemoteWorkerBinding).mockImplementation((_, options) =>
      Effect.succeed('https://owner.example/' + options.ownerRpc),
    );
    let lost = state === 'lost reply';
    const fetchOwner = vi.fn(async (url: string) => {
      if (url.endsWith('getOwnerReleaseIdentity')) return Response.json(pin);
      const fresh = observed.versions[0]?.version_id === nextVersionId;
      if (fresh && lost) {
        lost = false;
        throw new Error('The owner declaration response was lost');
      }
      return Response.json({
        identity: fresh
          ? {
              ...pin,
              versionId: state === 'stale' ? pin.versionId : nextVersionId,
              specHash: project.systemSpec.hash,
            }
          : pin,
        releaseSpec:
          fresh && state !== 'mismatch'
            ? makeReleaseSpec(updated)
            : makeReleaseSpec(orders),
      });
    });
    vi.stubGlobal('fetch', fetchOwner);
    const publish = vi.mocked(publishWranglerWorkerVersion);
    publish.mockImplementation(() =>
      Effect.sync(() => {
        observed = serving(nextVersionId);
        return nextVersionId;
      }),
    );

    const result = await runDeployment(
      Effect.gen(function* () {
        const workspace = yield* openWranglerDeploymentWorkspace(project);
        if (state === 'provisional' || state === 'unresolved') {
          const record = bootstrapRecord(
            workspace,
            accountId,
            getOwnerReleaseWorkerName(project.generatedConfig.name, release),
          );
          yield* record.write({
            runId: olderRunId,
            systemId: pin.systemId,
            owner: {
              specHash: olderSpec.hash,
              releaseSpec: makeReleaseSpec(orders),
            },
          });
        }
        const result = yield* Effect.result(
          Effect.gen(function* () {
            const owners = yield* prepareOwnerReleaseBindings(
              workspace,
              [
                {
                  type: 'plain_text',
                  name: 'ZEROSPIN_STORAGE_LAYOUT',
                  text: 'release-owned-v1',
                },
                ...['SystemRepo', 'AggregateChain', 'ServiceChain'].map(
                  (class_name, index) => ({
                    type: 'durable_object_namespace',
                    name:
                      ['SYSTEM_REPO', 'AGGREGATE_CHAIN', 'SERVICE_CHAIN'][
                        index
                      ] ?? '',
                    class_name,
                    namespace_id: class_name,
                  }),
                ),
              ],
              state === 'accepted'
                ? new Map([[getOwnerReleaseBindingName(release), pin]])
                : new Map(),
            );
            return yield* owners.publishOwnerReleases();
          }),
        );
        if (state === 'lost reply') {
          const saved = yield* bootstrapRecord(
            workspace,
            accountId,
            getOwnerReleaseWorkerName(project.generatedConfig.name, release),
          ).read;
          expect(saved?.owner).toEqual({
            specHash: project.systemSpec.hash,
            releaseSpec: makeReleaseSpec(updated),
          });
        }
        return result;
      }),
    );

    if (state === 'unresolved') {
      expect(result).toMatchObject({
        failure: { code: 'zerospin-owner-release-upload-pending' },
      });
    } else if (state === 'stale' || state === 'lost reply') {
      expect(result).toMatchObject({
        failure: { code: 'zerospin-owner-release-deployment-unverified' },
      });
    } else if (state === 'mismatch') {
      expect(result).toMatchObject({
        failure: { code: 'zerospin-owner-release-declaration-mismatch' },
      });
    } else {
      expect(result).toMatchObject({
        success: [
          state === 'accepted'
            ? pin
            : {
                ...pin,
                versionId: nextVersionId,
                specHash: project.systemSpec.hash,
              },
        ],
      });
    }
    expect(publish).toHaveBeenCalledTimes(
      state === 'accepted' || state === 'unresolved' ? 0 : 1,
    );
    if (state === 'accepted') {
      expect(fetchOwner.mock.calls.map(([url]) => url)).toEqual([
        'https://owner.example/getOwnerReleaseIdentity',
      ]);
    } else if (state === 'provisional') {
      expect(fetchOwner.mock.calls.map(([url]) => url)).toEqual([
        'https://owner.example/getOwnerReleaseDeclaration',
        'https://owner.example/getOwnerReleaseDeclaration',
      ]);
    }
  },
);

it('recognizes the promoted SystemWorker while owner pin acceptance is pending', async () => {
  const pin = {
    systemId: 'sys_recovery_test',
    release: { serviceName: 'orders', serviceVersion: 1 },
    versionId: randomUUID(),
    specHash: project.systemSpec.hash,
  };
  const versionId = randomUUID();
  const versions = [{ version_id: versionId, percentage: 100 }];
  const intent = {
    phase: 'promote' as const,
    priorDeploymentId: randomUUID(),
    message: 'interrupted-promotion',
    versions,
    preparation: {
      specHash: project.systemSpec.hash,
      ownerReleases: [pin],
      agentVersionId: 'agent-candidate',
      agentPriorDeploymentId: 'agent-incumbent',
    },
  };
  const deployment = {
    id: randomUUID(),
    created_on: '2026-11-20T00:00:00Z',
    annotations: { 'workers/message': intent.message },
    versions,
  };
  vi.mocked(openRemoteWorkerBinding).mockReturnValue(
    Effect.succeed('https://owner.example'),
  );
  vi.mocked(runWranglerCommand).mockReturnValue(wranglerJson(deployment));
  preflightDeployment
    .mockReturnValueOnce(
      Effect.succeed({
        versionId,
        bootstrap: false,
        acceptedOwnerReleases: [],
      }),
    )
    .mockReturnValueOnce(
      Effect.succeed({
        versionId,
        bootstrap: false,
        acceptedOwnerReleases: [pin],
      }),
    );

  await runDeployment(
    Effect.gen(function* () {
      const workspace = yield* openWranglerDeploymentWorkspace(project);
      expect(
        yield* verifyServingSystem(workspace, deployment, intent),
      ).toMatchObject({ versionId, acceptedOwnerReleases: [] });
      expect(
        yield* verifyServingSystem(workspace, deployment, intent),
      ).toMatchObject({ acceptedOwnerReleases: [pin] });
    }),
  );
});

it.each(['ready', 'stale version', 'wrong owner'])(
  'promotes before verifying and completes only for the verified executable (%s)',
  async state => {
    const versionId = randomUUID();
    const previous = {
      id: randomUUID(),
      created_on: '2026-11-22T00:00:00Z',
      versions: [{ version_id: randomUUID(), percentage: 100 }],
    };
    const candidate = {
      workerName: project.generatedConfig.name,
      versionId,
      incumbentVersionId: previous.versions[0]!.version_id,
      stagedDeploymentId: randomUUID(),
    };
    const promoted = {
      ...previous,
      id: randomUUID(),
      versions: [{ version_id: versionId, percentage: 100 }],
    };
    const pin = {
      systemId: project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID,
      release: { serviceName: 'orders', serviceVersion: 1 },
      versionId: randomUUID(),
      specHash: project.systemSpec.hash,
    };
    const calls: string[] = [];
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'f'.repeat(32));
    vi.mocked(loadDeploymentProject).mockReturnValue(
      Effect.succeed({ kind: 'project', project }),
    );
    vi.mocked(openRemoteWorkerBinding).mockReturnValue(
      Effect.succeed('https://binding.example'),
    );
    vi.mocked(runWranglerCommand).mockImplementation((_, args) =>
      wranglerJson(
        args[0] === 'versions'
          ? { id: versionId, resources: { bindings: [] } }
          : calls.includes('promote')
            ? promoted
            : previous,
      ),
    );
    vi.spyOn(
      candidatePreparation,
      'prepareSystemWorkerCandidate',
    ).mockReturnValue(
      Effect.succeed({
        ownerPins: [pin],
        owners: {
          publishOwnerReleases: () => Effect.succeed([pin]),
          incumbentBindingNames: [],
          services: [],
          verifyCandidateBindings: () => Effect.succeed(undefined),
        },
        agent: {
          versionId: 'agent-candidate',
          priorDeploymentId: 'agent-incumbent',
          stableConfig: project.generatedConfig,
          service: {
            binding: 'ZEROSPIN_AGENT_WORKER',
            service: 'fixture-agent',
          },
          verifyStableBindings: () => Effect.succeed(undefined),
          activate: Effect.succeed(undefined),
        },
      }),
    );
    vi.spyOn(staging, 'stageSystemWorkerUpdate').mockReturnValue(
      Effect.succeed(candidate),
    );
    vi.spyOn(promotion, 'promoteSystemWorkerUpdate').mockImplementation(() =>
      Effect.sync(() => {
        calls.push('promote');
        return promoted;
      }),
    );
    preflightDeployment.mockImplementation(() =>
      Effect.sync(() => {
        const servingVersion = calls.includes('promote')
          ? state === 'stale version'
            ? candidate.incumbentVersionId
            : versionId
          : candidate.incumbentVersionId;
        if (calls.includes('promote')) calls.push('verify');
        return {
          versionId: servingVersion,
          bootstrap: false,
          acceptedOwnerReleases: [],
        };
      }),
    );
    const headers = { 'X-Zerospin-Worker-Version': versionId };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => {
        if (options.method !== 'POST') return Response.json([pin], { headers });
        const observed =
          state === 'wrong owner' ? { ...pin, versionId: 'wrong-owner' } : pin;
        return Response.json(observed, { headers });
      }),
    );
    systemApi.makeSystemSpec.mockReturnValue(
      Effect.succeed(project.systemSpec),
    );
    systemApi.acceptSystemSpec.mockImplementation(() =>
      Effect.sync(() => {
        calls.push('accept');
      }),
    );
    systemApi.getExecutingWorkerVersion.mockReturnValue(
      Effect.succeed(versionId),
    );
    systemApi.initialize.mockImplementation(() =>
      Effect.sync(() => {
        calls.push('initialize');
      }),
    );

    const result = await runDeployment(Effect.result(deployWranglerFn()));
    if (state === 'ready') {
      expect(result._tag).toBe('Success');
      expect(calls).toEqual(['promote', 'verify', 'accept', 'initialize']);
      expect(systemApi.acceptSystemSpec).toHaveBeenCalledWith({
        expectedVersionId: versionId,
      });
      expect(systemApi.initialize).toHaveBeenCalledWith({
        expectedVersionId: versionId,
      });
    } else {
      expect(result).toMatchObject({
        failure: {
          code:
            state === 'stale version'
              ? 'zerospin-deployment-changed'
              : 'zerospin-owner-release-binding-changed',
        },
      });
      expect(calls).toEqual(['promote', 'verify']);
    }
  },
);
