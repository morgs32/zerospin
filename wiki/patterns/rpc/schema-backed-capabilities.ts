import { makeZerospinError } from '@zerospin/error';
import { Context, Layer, Schema } from 'effect';

import {
  makeRpcApi,
  rpcMethod,
} from '../../../packages/system-worker/src/makeRpcApi/makeRpcApi.js';

/**
 * Declare the Gateway/System/aggregate/service/access/session API family through
 * makeRpcApi; keep each rpcMethod definition in its same-named method folder.
 * Decode schemas before domain work; infer Promise methods from the method definitions.
 * Retain capability state in an API-qualified Initialized layer supplied to super.
 * Construct results/capabilities in synchronous onSuccess/onFailure callbacks,
 * after the completed root is collected and optional hosted export is settled.
 * rpcRequestSchema(tuple) retains the wire envelope but supplies only decoded
 * args to the domain body. StructWithRest accepts unrelated outer envelope fields;
 * rpcMethod keeps argument tuples/structs strict. Access failure classifiers use
 * strict decodeUnknownOption on the outer shape, not Schema.is (which ignores extras).
 * Linked method definitions return the existing { result, link }.
 *
 * @bad Inject runners, createApi callbacks, or procedure registries into capabilities.
 * @bad Handwrite public methods/getters alongside a generated method definition record.
 * @bad Use TypeScript private to hide state or implementation members from RPC.
 * @bad Thread retained identity together with raw request props into domain bodies.
 * @bad Decode the same wire input again in a keyed Repo.
 * @bad Install per-instance services into mutable global context.
 */
class Initialized extends Context.Service<
  Initialized,
  { readonly systemId: string }
>()('ExampleApi.Initialized') {}

const inspect = rpcMethod({
  name: 'ExampleApi.inspect',
  schema: Schema.Struct({ name: Schema.String }),
  parseError: {
    code: 'inspect-arguments-invalid',
    prefix: 'Invalid inspection request',
  },
})(
  function* (request) {
    const { name } = request;
    const { systemId } = yield* Initialized;
    if (name === '') return yield* makeZerospinError('name-required');
    return { systemId, name };
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);

export class ExampleApi extends makeRpcApi('ExampleApi', { inspect }) {
  constructor(systemId: string) {
    super(Layer.succeed(Initialized, { systemId }));
  }
}
