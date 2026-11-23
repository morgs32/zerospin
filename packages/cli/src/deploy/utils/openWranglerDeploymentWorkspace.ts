import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import type {
  IDeploymentProject,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { makeSystemWorkerEntrypoint } from './makeSystemWorkerEntrypoint.js';

/** Own temporary files before writing any secret, so failed acquisition is cleaned too. */
export const openWranglerDeploymentWorkspace = makeFn(
  'openWranglerDeploymentWorkspace',
)(function* (project: IDeploymentProject) {
  const directory = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const root = path.join(project.cwd, '.wrangler', 'zerospin');
        await fs.mkdir(root, { recursive: true });
        return fs.mkdtemp(path.join(root, 'deploy-'));
      },
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-wrangler-temp-directory-failed',
          message: 'Failed to create deployment workspace.',
          cause: prettyUnknownFailure(cause),
        }),
    }),
    directory =>
      Effect.tryPromise({
        try: () => fs.rm(directory, { recursive: true, force: true }),
        catch: cause =>
          makeZerospinError({
            code: 'zerospin-wrangler-temp-directory-remove-failed',
            message: 'Failed to remove deployment workspace.',
            cause: prettyUnknownFailure(cause),
          }),
      }).pipe(
        Effect.catchCause(cause =>
          Effect.sync(() =>
            process.stderr.write(
              `Deployment cleanup failed: ${prettyUnknownFailure(cause)}\n`,
            ),
          ),
        ),
      ),
  );
  const environment = { ...process.env };
  for (const key of [
    'ZEROSPIN_API_URL',
    'ZEROSPIN_PUBLISHABLE_KEY',
    'ZEROSPIN_SECRET_KEY',
    'CLERK_JWT_KEY',
    ...project.telemetrySecretBindingNames,
  ]) {
    Reflect.deleteProperty(environment, key);
  }
  const ownerTelemetrySecretsPath =
    Object.keys(project.telemetrySecrets).length === 0
      ? undefined
      : path.join(directory, 'owner-telemetry-secrets.json');
  const stableEntry = path.join(directory, 'SystemWorker.mjs');
  const stableSpec = path.join(directory, 'system-spec.txt');
  const { generatedConfig, systemSpec } = project;
  const workspace: IWranglerDeploymentWorkspace = {
    project: {
      ...project,
      generatedConfig: {
        ...generatedConfig,
        main: stableEntry,
        preserve_file_names: true,
        minify: true,
        vars: {
          ...generatedConfig.vars,
          ZEROSPIN_SYSTEM_SPEC_HASH: systemSpec.hash,
        },
      },
    },
    directory,
    runId: randomUUID(),
    environment,
    pendingCloudflareWrites: new Set(),
    configPath: path.join(directory, 'wrangler.json'),
    stableSpecPath: stableSpec,
    secretsPath: path.join(directory, 'secrets.json'),
    ownerTelemetrySecretsPath,
    envFilePath: path.join(directory, 'empty.env'),
  };
  yield* Effect.tryPromise({
    try: async () => {
      await Promise.all([
        fs.writeFile(
          workspace.configPath,
          JSON.stringify(workspace.project.generatedConfig),
          { mode: 0o600 },
        ),
        fs.writeFile(
          workspace.secretsPath,
          JSON.stringify({
            ZEROSPIN_PUBLISHABLE_KEY: project.keys.publishableKey,
            ZEROSPIN_SECRET_KEY: project.keys.secretKey,
            ...project.telemetrySecrets,
          }),
          { mode: 0o600 },
        ),
        fs.writeFile(workspace.envFilePath, '', { mode: 0o600 }),
        fs.writeFile(
          stableEntry,
          makeSystemWorkerEntrypoint(generatedConfig.main),
          { mode: 0o600 },
        ),
        fs.writeFile(
          stableSpec,
          JSON.stringify({ spec: systemSpec, ownerReleases: [] }),
          { mode: 0o600 },
        ),
      ]);
      if (ownerTelemetrySecretsPath !== undefined) {
        await fs.writeFile(
          ownerTelemetrySecretsPath,
          JSON.stringify(project.telemetrySecrets),
          { mode: 0o600 },
        );
      }
    },
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-wrangler-temp-files-write-failed',
        message: 'Failed to prepare deployment files.',
        cause: prettyUnknownFailure(cause),
      }),
  });
  return workspace;
});
