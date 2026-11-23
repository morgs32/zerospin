import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';

/** Schema-backed SystemApi.healthcheck boundary; domain work starts after decoding. */
export const healthcheck = rpcMethod({
  name: 'SystemApi.healthcheck',
  schema: rpcRequestSchema(Schema.declare<[]>((_input): _input is [] => true)),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.healthcheck received invalid arguments',
  },
  linked: true,
})(
  function* (_args) {
    return yield* Effect.succeed('healthy');
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
