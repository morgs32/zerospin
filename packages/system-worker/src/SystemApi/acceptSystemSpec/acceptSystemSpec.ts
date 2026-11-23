import { DeploymentWorkerVersionArgsSchema } from '@zerospin/core/systemApi/DeploymentWorkerVersionArgsSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { SYSTEM_REPO_PREFLIGHT_PREFIX } from '../../SystemRepo/preflightAcceptedSystemSpec.js';
import { requireWorkerVersion } from '../../workerConfiguration/requireWorkerVersion.js';
import { listPinnedOwnerReleases } from '../../workerConfiguration/workerConfiguration.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.acceptSystemSpec boundary; domain work starts after decoding. */
export const acceptSystemSpec = rpcMethod({
  name: 'SystemApi.acceptSystemSpec',
  schema: rpcRequestSchema(DeploymentWorkerVersionArgsSchema),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.acceptSystemSpec received invalid arguments',
  },
  linked: true,
})(
  function* ([deployment]) {
    const authResults = yield* Initialized;
    yield* requireWorkerVersion(
      deployment?.expectedVersionId,
      env.ZEROSPIN_VERSION_METADATA?.id,
    );

    if (env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-pins-unavailable',
        message:
          'Deploy and verify the System Worker candidate before acceptance.',
      });
    }
    const spec = yield* getSystemSpec();
    const {
      ZEROSPIN_DEV_STARTUP_SPEC_HASH: startupSpecHash,
      ZEROSPIN_ENVIRONMENT: environment,
    } = env;
    // Check the same executing spec that acceptance would persist.
    if (
      environment === 'dev' &&
      startupSpecHash !== undefined &&
      spec.hash !== startupSpecHash
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-dev-system-spec-changed',
        message:
          'SystemSpec changed. Finish your edits, then restart zerospin dev.',
      });
    }
    const systemRepos = yield* SystemRepos;
    const systemRepo = yield* systemRepos.getRepo({
      key: { systemId: authResults.systemId },
    });
    const archiveBackedHistoryRequired = () =>
      makeZerospinError({
        code: 'aggregate-history-storage-incompatible',
        message:
          'Could not establish archive-backed Aggregate history on the serving SystemRepo. This deployment requires fresh storage.',
      });
    const recordedCommandStorageRequired = () =>
      makeZerospinError({
        code: 'recorded-command-storage-reset-required',
        message:
          'Ordinary continuations require fresh command history storage before accepting this deployment.',
      });
    return yield* Effect.gen(function* () {
      const recordedCommandStorage = yield* Effect.tryPromise({
        try: () => systemRepo.hasOrdinaryContinuationStorage(),
        catch: error =>
          error instanceof Error &&
          error.message.includes('hasOrdinaryContinuationStorage')
            ? recordedCommandStorageRequired()
            : error,
      });
      if (recordedCommandStorage !== true) {
        return yield* recordedCommandStorageRequired();
      }
      const archiveBackedHistory = yield* Effect.tryPromise({
        try: () => systemRepo.hasArchiveBackedAggregateHistory(),
        catch: error =>
          error instanceof Error &&
          error.message.includes(SYSTEM_REPO_PREFLIGHT_PREFIX)
            ? error
            : archiveBackedHistoryRequired(),
      });
      if (archiveBackedHistory !== true) {
        return yield* archiveBackedHistoryRequired();
      }
      const agentStorageRequired = () =>
        makeZerospinError({
          code: 'agent-wake-storage-incompatible',
          message:
            'The serving SystemRepo must support version-bound Agent installations before catalog acceptance.',
        });
      const agentInstallationStorage = yield* Effect.tryPromise({
        try: () => systemRepo.hasVersionBoundAgentInstallationStorage(),
        catch: error =>
          error instanceof Error &&
          error.message.includes('hasVersionBoundAgentInstallationStorage')
            ? agentStorageRequired()
            : error,
      });
      if (agentInstallationStorage !== true) {
        return yield* agentStorageRequired();
      }
      const envelope = yield* Effect.tryPromise({
        try: () =>
          systemRepo.registerSystemSpec({
            spec,
            ownerReleases: listPinnedOwnerReleases(),
          }),
        catch: error => error,
      });
      return yield* readRpcEnvelope(envelope);
    }).pipe(
      Effect.catch(error => {
        if (isZerospinError(error)) return Effect.fail(error);
        if (!(error instanceof Error)) return Effect.die(error);
        const prefix = error.message.indexOf(SYSTEM_REPO_PREFLIGHT_PREFIX);
        if (prefix === -1) return Effect.die(error);
        const failure = error.message.slice(
          prefix + SYSTEM_REPO_PREFLIGHT_PREFIX.length,
        );
        const separator = failure.indexOf(': ');
        const code = failure.slice(0, separator);
        if (
          code !== 'system-spec-invalid' &&
          code !== 'system-spec-version-mismatch' &&
          code !== 'recorded-command-storage-reset-required' &&
          code !== 'aggregate-history-storage-incompatible' &&
          code !== 'agent-wake-storage-incompatible'
        ) {
          return Effect.die(error);
        }
        return Effect.fail(
          makeZerospinError({ code, message: failure.slice(separator + 2) }),
        );
      }),
    );
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
