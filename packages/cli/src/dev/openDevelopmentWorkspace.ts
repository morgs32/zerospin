import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  getOwnerReleaseBindingName,
  getOwnerReleaseWorkerName,
  OWNER_RELEASE_BINDING_PREFIX,
} from '@zerospin/core/system/ownerReleaseDeployment';
import {
  configureAgentPlacement,
  getApplicationResourceBindingNames,
  makeAgentWranglerConfig,
  makeWranglerConfig,
} from '@zerospin/dev-worker/makeWranglerConfig';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';

import { makeSystemWorkerEntrypoint } from '../deploy/utils/makeSystemWorkerEntrypoint.js';
import {
  prepareOwnerReleaseWranglerConfig,
  readPredecessorRelease,
} from '../deploy/utils/writeOwnerReleaseEntrypoint.js';

import type { IDevelopmentOptions } from './devFn.js';
import type { loadDevelopmentProject } from './loadDevelopmentProject.js';
import { openDevelopmentStorage } from './openDevelopmentStorage.js';

const require = createRequire(import.meta.url);

type IDevelopmentProject = Effect.Success<
  ReturnType<typeof loadDevelopmentProject>
>;

async function prepareDevelopmentWorkers(
  project: IDevelopmentProject,
  directory: string,
) {
  const { cwd, config, systemSpec, ownerReleases } = project;
  const configModulePath = path.join(cwd, 'zerospin.config.ts');
  const frameworkMain =
    require.resolve('@zerospin/production-worker/SystemWorker');
  const main = path.join(directory, 'SystemWorker.mjs');
  const base = makeWranglerConfig({
    config,
    main,
    configModulePath,
    environment: 'production',
  });
  const stable = {
    ...base,
    vars: {
      ...base.vars,
      ZEROSPIN_ENVIRONMENT: 'dev' as const,
      ZEROSPIN_LOCAL_DEVELOPMENT: 'true',
      ZEROSPIN_SYSTEM_SPEC_HASH: systemSpec.hash,
      ZEROSPIN_DEV_STARTUP_SPEC_HASH: systemSpec.hash,
    },
  };
  const owners = ownerReleases.map(loaded => ({
    ...loaded,
    binding: {
      binding: getOwnerReleaseBindingName(loaded.release),
      service: getOwnerReleaseWorkerName(stable.name, loaded.release),
    },
    versionId: randomUUID(),
  }));
  const bindings = owners.map(owner => owner.binding);
  const bindingsByRelease = new Map(
    bindings.map(binding => [binding.binding, binding]),
  );
  const agent = makeAgentWranglerConfig({
    stable,
    main: require.resolve('@zerospin/agent-worker/AgentWorker'),
    configModulePath,
    application: config.wrangler,
  });
  const ownerConfigs = await Promise.all(
    owners.map(async owner => {
      const releaseConfig = await prepareOwnerReleaseWranglerConfig({
        ...owner,
        directory,
        frameworkMain:
          'aggregateName' in owner.release
            ? require.resolve('@zerospin/owner-release-worker/AggregateReleaseWorker')
            : require.resolve('@zerospin/owner-release-worker/ServiceReleaseWorker'),
        stable,
        config,
      });
      const predecessor = readPredecessorRelease(systemSpec, owner.release);
      const binding =
        predecessor === undefined
          ? undefined
          : bindingsByRelease.get(getOwnerReleaseBindingName(predecessor));
      if (predecessor !== undefined && binding === undefined) {
        throw new Error(
          'Missing predecessor binding for ' + releaseConfig.name + '.',
        );
      }
      return {
        ...releaseConfig,
        services:
          binding === undefined
            ? releaseConfig.services
            : [...releaseConfig.services, binding],
        vars: withLocalVersion(releaseConfig.vars, owner.versionId),
      };
    }),
  );
  await Promise.all([
    fs.writeFile(main, makeSystemWorkerEntrypoint(frameworkMain), {
      mode: 0o600,
    }),
    fs.writeFile(
      path.join(directory, 'system-spec.txt'),
      JSON.stringify({
        spec: systemSpec,
        ownerReleases: owners.map(({ release, versionId }) => ({
          systemId: config.systemId,
          release,
          versionId,
          specHash: systemSpec.hash,
        })),
      }),
      { mode: 0o600 },
    ),
  ]);
  return [
    {
      ...configureAgentPlacement(stable, 'separate'),
      workers_dev: true,
      preview_urls: false,
      services: [
        ...bindings,
        { binding: 'ZEROSPIN_AGENT_WORKER', service: agent.name },
      ],
      vars: withLocalVersion({
        ...stable.vars,
        ZEROSPIN_SECRET_KEY: 'sk_dev',
        ZEROSPIN_PUBLISHABLE_KEY: 'pk_dev',
      }),
    },
    {
      ...agent,
      services: [...agent.services, ...bindings],
      vars: withLocalVersion(agent.vars),
    },
    ...ownerConfigs,
  ];
}

/** Use the same runtime binding shape with IDs scoped to the local session. */
function withLocalVersion<Vars extends object>(vars: Vars, id = randomUUID()) {
  return { ...vars, ZEROSPIN_VERSION_METADATA: { id } };
}

export const openDevelopmentWorkspace = Effect.fn('openDevelopmentWorkspace')(
  function* (
    project: IDevelopmentProject,
    { clean, stateDir, sharedR2 }: IDevelopmentOptions,
  ) {
    const { cwd, config, wrangler } = project;
    const fileSystem = yield* FileSystem.FileSystem;
    const root = path.join(cwd, '.wrangler', 'zerospin');
    const run = yield* fileSystem.makeDirectory(root, { recursive: true }).pipe(
      Effect.flatMap(() =>
        fileSystem.makeTempDirectoryScoped({
          directory: root,
          prefix: 'dev-config-',
        }),
      ),
      Effect.mapError(cause =>
        makeZerospinError({
          code: 'zerospin-dev-generated-config-write-failed',
          message: 'Failed to prepare the local Wrangler configuration.',
          cause: prettyUnknownFailure(cause),
        }),
      ),
    );
    const prepared = yield* Effect.tryPromise({
      try: async () => {
        const workers = await prepareDevelopmentWorkers(project, run);
        const localBindings = wrangler.unstable_getVarsForDev(
          path.join(cwd, 'zerospin.config.ts'),
          undefined,
          {},
          undefined,
          true,
        );
        for (const name of getApplicationResourceBindingNames(
          config.wrangler ?? {},
        )) {
          if (Object.hasOwn(localBindings, name)) {
            throw makeZerospinError({
              code: 'zerospin-wrangler-dev-binding-conflict',
              message: `Local environment value "${name}" conflicts with a System Wrangler resource binding.`,
            });
          }
        }
        const environment: NodeJS.ProcessEnv = {
          ...process.env,
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
          ...(project.registry === undefined
            ? {}
            : { WRANGLER_REGISTRY_PATH: project.registry }),
        };
        const reserved = new Set([
          ...workers.flatMap(worker => [
            ...Object.keys(worker.vars),
            ...worker.durable_objects.bindings.map(binding => binding.name),
          ]),
          'ZEROSPIN_AGENT_WORKER',
          'ZEROSPIN_DEV_HISTORY',
        ]);
        for (const name of Object.keys(environment)) {
          if (
            reserved.has(name) ||
            name.startsWith(OWNER_RELEASE_BINDING_PREFIX)
          ) {
            delete environment[name];
          }
        }
        const secrets = Object.keys(localBindings).filter(name => {
          const value = localBindings[name]?.value;
          if (
            typeof value !== 'string' ||
            reserved.has(name) ||
            name.startsWith(OWNER_RELEASE_BINDING_PREFIX)
          ) {
            return false;
          }
          environment[name] = value;
          return true;
        });
        const telemetrySecrets = Object.values(
          config.telemetry?.otlp?.secretHeaders ?? {},
        ).filter(
          name =>
            typeof environment[name] === 'string' && environment[name] !== '',
        );
        return {
          workers,
          secrets: [...new Set([...secrets, ...telemetrySecrets])],
          telemetrySecrets,
          environment,
        };
      },
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : makeZerospinError({
              code: 'zerospin-dev-config-failed',
              message: 'Failed to prepare the local Worker layout.',
              cause: prettyUnknownFailure(cause),
            }),
    });

    const storageRoot = path.resolve(
      cwd,
      stateDir ?? path.join(root, 'dev-worker'),
      encodeURIComponent(config.systemId),
    );
    const { history, persistPath } = yield* Effect.tryPromise({
      try: () =>
        openDevelopmentStorage({
          root: storageRoot,
          systemId: config.systemId,
          clean,
          sharedR2Root:
            sharedR2 === undefined ? undefined : path.resolve(cwd, sharedR2),
        }),
      catch: cause =>
        makeZerospinError({
          code: clean
            ? 'zerospin-dev-clean-failed'
            : 'zerospin-dev-history-open-failed',
          message: `Failed to open local System storage at ${storageRoot}.`,
          cause: prettyUnknownFailure(cause),
        }),
    });

    const configPaths = yield* Effect.tryPromise({
      try: () =>
        Promise.all(
          prepared.workers.map(async (worker, index) => {
            const { version_metadata: _platformMetadata, ...local } = worker;
            const secrets =
              index === 0 ? prepared.telemetrySecrets : prepared.secrets;
            const configPath = path.join(run, worker.name + '.json');
            await fs.writeFile(
              configPath,
              JSON.stringify({
                ...local,
                vars: {
                  ...local.vars,
                  ZEROSPIN_DEV_HISTORY: JSON.stringify(history),
                },
                secrets: { required: secrets },
              }),
              { mode: 0o600 },
            );
            return configPath;
          }),
        ),
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-dev-generated-config-write-failed',
          message: 'Failed to write the local Worker configurations.',
          cause: prettyUnknownFailure(cause),
        }),
    });
    return { configPaths, persistPath, environment: prepared.environment };
  },
);
