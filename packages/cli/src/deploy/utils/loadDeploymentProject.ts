import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { config as loadEnv } from 'dotenv';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { GeneratedProductionKeys } from '../GeneratedProductionKeys.js';
import { loadZerospinProject } from '../loadZerospinConfigFn.js';

import type { IDeploymentProject } from './deploymentTypes.js';

const require = createRequire(import.meta.url);

export const loadDeploymentProject = makeFn('loadDeploymentProject')(
  function* () {
    const cwd = process.cwd();
    loadEnv({ path: path.join(cwd, '.env.local') });
    loadEnv({ path: path.join(cwd, '.env') });
    const publishableKey = process.env['ZEROSPIN_PUBLISHABLE_KEY'];
    const secretKey = process.env['ZEROSPIN_SECRET_KEY'];
    if (!publishableKey || !secretKey) {
      return {
        kind: 'keysRequired' as const,
        result: GeneratedProductionKeys.make({
          data: {
            envFilePath: path.join(cwd, '.env.local'),
            zerospinPublishableKey: `pk_live_${randomBytes(32).toString('base64url')}`,
            zerospinSecretKey: `sk_live_${randomBytes(32).toString('base64url')}`,
          },
        }),
      };
    }
    const { config, ownerReleases } = yield* loadZerospinProject({
      cwd,
      resolveOwnerReleases: true,
    }).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );
    const project = yield* Effect.try({
      try: (): IDeploymentProject => {
        const telemetrySecretBindingNames = [
          ...new Set(
            Object.values(config.telemetry?.otlp?.secretHeaders ?? {}),
          ),
        ];
        const telemetrySecrets = Object.fromEntries(
          telemetrySecretBindingNames.flatMap(bindingName => {
            const value = process.env[bindingName];
            return value === undefined || value === ''
              ? []
              : [[bindingName, value]];
          }),
        );
        const wranglerPackage = require.resolve('wrangler/package.json', {
          paths: [cwd],
        });
        const main =
          require.resolve('@zerospin/production-worker/SystemWorker');
        const configModulePath = path.resolve(cwd, 'zerospin.config.ts');
        return {
          cwd,
          configModulePath,
          applicationBindings: config.wrangler,
          systemSpec: Schema.decodeUnknownSync(SystemSpecSchema)(
            makeSystemSpec({ system: config.system }),
          ),
          agentWorkerMain:
            require.resolve('@zerospin/agent-worker/AgentWorker'),
          aggregateReleaseWorkerMain:
            require.resolve('@zerospin/owner-release-worker/AggregateReleaseWorker'),
          serviceReleaseWorkerMain:
            require.resolve('@zerospin/owner-release-worker/ServiceReleaseWorker'),
          ownerReleases,
          keys: { publishableKey, secretKey },
          telemetrySecretBindingNames,
          telemetrySecrets,
          wranglerBinPath: path.join(
            path.dirname(wranglerPackage),
            'bin',
            'wrangler.js',
          ),
          generatedConfig: makeWranglerConfig({
            config,
            main,
            configModulePath,
            environment: 'production',
          }),
        };
      },
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : makeZerospinError({
              code: 'zerospin-wrangler-config-invalid',
              message:
                'Could not resolve Wrangler or generate the production Worker configuration.',
              cause: prettyUnknownFailure(cause),
            }),
    });
    return { kind: 'project' as const, project };
  },
);
