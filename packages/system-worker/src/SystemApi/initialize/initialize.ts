import { DeploymentWorkerVersionArgsSchema } from '@zerospin/core/systemApi/DeploymentWorkerVersionArgsSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { requireWorkerVersion } from '../../workerConfiguration/requireWorkerVersion.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.initialize boundary; domain work starts after decoding. */
export const initialize = rpcMethod({
  name: 'SystemApi.initialize',
  schema: rpcRequestSchema(DeploymentWorkerVersionArgsSchema),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.initialize received invalid arguments',
  },
  linked: true,
})(
  function* ([deployment]) {
    const authResults = yield* Initialized;
    yield* requireWorkerVersion(
      deployment?.expectedVersionId,
      env.ZEROSPIN_VERSION_METADATA?.id,
    );

    const systemRepos = yield* SystemRepos;
    const systemRepo = yield* systemRepos.getRepo({
      key: { systemId: authResults.systemId },
    });

    // map a rejected initialize RPC to system-api-initialize-failed
    const failures = yield* Effect.promise(() =>
      systemRepo.initialize(deployment?.expectedVersionId),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
    if (failures.length > 0) {
      return yield* makeZerospinError({
        code: 'agent-initialization-failed',
        message: failures.join('\n'),
      });
    }
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
