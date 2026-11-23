import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';

/** Schema-backed SystemApi.makeSystemSpec boundary; domain work starts after decoding. */
export const makeSystemSpec = rpcMethod({
  name: 'SystemApi.makeSystemSpec',
  schema: rpcRequestSchema(Schema.declare<[]>((_input): _input is [] => true)),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.makeSystemSpec received invalid arguments',
  },
  linked: true,
})(
  function* (_args) {
    // serialize the static authored system through getSystemSpec
    return yield* getSystemSpec();
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
