import { ServiceQuerySchema } from '@zerospin/core/systemApi/ServiceQuerySchema';
import * as Schema from 'effect/Schema';

import { executeServiceQuery as executeSystemWorkerServiceQuery } from '../../executeServiceQuery/executeServiceQuery.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { Initialized } from '../Initialized.js';

/** Decode the service read once and retain the admitted system identity. */
export const executeServiceQuery = rpcMethod({
  name: 'SystemApi.executeServiceQuery',
  schema: rpcRequestSchema(Schema.mutable(Schema.Tuple([ServiceQuerySchema]))),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.executeServiceQuery received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [query] = args;
    const { systemId } = yield* Initialized;
    return yield* executeSystemWorkerServiceQuery({ systemId, ...query });
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
