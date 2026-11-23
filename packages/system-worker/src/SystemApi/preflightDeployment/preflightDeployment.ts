import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Check the authenticated serving System identity and retained catalog. */
export const preflightDeployment = rpcMethod({
  name: 'SystemApi.preflightDeployment',
  schema: rpcRequestSchema(
    Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          systemId: Schema.String,
          systemSpec: SystemSpecSchema,
        }),
      ]),
    ),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.preflightDeployment received invalid arguments',
  },
  linked: true,
})(
  function* ([{ systemId, systemSpec }]) {
    const initialized = yield* Initialized;
    const servingSpec = yield* getSystemSpec();
    if (
      systemId !== initialized.systemId ||
      systemId !== env.ZEROSPIN_SYSTEM_ID ||
      systemSpec.systemName !== servingSpec.systemName
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-system-identity-mismatch',
        message:
          'The proposed System name or ID differs from the running System.',
      });
    }
    const repos = yield* SystemRepos;
    const repo = yield* repos.getRepo({
      key: { systemId: initialized.systemId },
    });
    const preflight = yield* Effect.tryPromise({
      try: () => repo.preflightDeployment(systemSpec),
      catch: () =>
        makeZerospinError({
          code: 'zerospin-deployment-system-repo-unavailable',
          message:
            'The serving SystemRepo could not read its retained catalog.',
        }),
    });
    const acceptedOwnerReleases = yield* readRpcEnvelope(preflight);
    return {
      versionId: env.ZEROSPIN_VERSION_METADATA?.id ?? null,
      bootstrap: env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true,
      acceptedOwnerReleases,
    };
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
