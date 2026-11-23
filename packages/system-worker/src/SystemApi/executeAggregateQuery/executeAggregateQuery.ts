import { AggregateQuerySchema } from '@zerospin/core/systemApi/AggregateQuerySchema';
import * as Schema from 'effect/Schema';

import { executeAggregateQuery as executeSystemWorkerAggregateQuery } from '../../executeAggregateQuery/executeAggregateQuery.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { Initialized } from '../Initialized.js';

/** Decode the aggregate read once and retain the admitted system identity. */
export const executeAggregateQuery = rpcMethod({
  name: 'SystemApi.executeAggregateQuery',
  schema: rpcRequestSchema(
    Schema.mutable(Schema.Tuple([AggregateQuerySchema])),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.executeAggregateQuery received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [query] = args;
    const { systemId } = yield* Initialized;
    return yield* executeSystemWorkerAggregateQuery({ systemId, ...query });
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
