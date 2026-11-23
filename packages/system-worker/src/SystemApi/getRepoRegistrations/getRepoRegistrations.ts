import { RepoTypeSchema } from '@zerospin/core/system/RepoTypeSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Inspect one concrete Repo kind within the authenticated system capability. */
export const getRepoRegistrations = rpcMethod({
  name: 'SystemApi.getRepoRegistrations',
  schema: rpcRequestSchema(
    Schema.mutable(Schema.Tuple([Schema.Struct({ repoType: RepoTypeSchema })])),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.getRepoRegistrations received invalid arguments',
  },
  linked: true,
})(
  function* ([{ repoType }]) {
    const { systemId } = yield* Initialized;
    const systemRepo = yield* (yield* SystemRepos).getRepo({
      key: { systemId },
    });
    return yield* Effect.promise(() =>
      systemRepo.getRepoRegistrations({ repoType }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
