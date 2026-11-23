import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.getExecutingWorkerVersion boundary; domain work starts after decoding. */
export const getExecutingWorkerVersion = rpcMethod({
  name: 'SystemApi.getExecutingWorkerVersion',
  schema: rpcRequestSchema(Schema.declare<[]>((_input): _input is [] => true)),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.getExecutingWorkerVersion received invalid arguments',
  },
  linked: true,
})(
  function* (_args) {
    const authResults = yield* Initialized;

    const systemRepos = yield* SystemRepos;
    const systemRepo = yield* systemRepos.getRepo({
      key: { systemId: authResults.systemId },
    });
    return yield* Effect.promise(() =>
      systemRepo.getExecutingWorkerVersion(),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
