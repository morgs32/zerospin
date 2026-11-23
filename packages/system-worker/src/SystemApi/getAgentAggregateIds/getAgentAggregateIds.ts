import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Schema-backed SystemApi.getAgentAggregateIds boundary; domain work starts after decoding. */
export const getAgentAggregateIds = rpcMethod({
  name: 'SystemApi.getAgentAggregateIds',
  schema: rpcRequestSchema(
    Schema.mutable(
      Schema.Tuple([
        Schema.Struct({
          aggregateName: Schema.String,
          aggregateVersion: VersionSchema,
        }),
      ]),
    ),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.getAgentAggregateIds received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ aggregateName, aggregateVersion }] = args;

    const system = yield* getSystemSpec();
    if (
      system.aggregates[aggregateName]?.releases[aggregateVersion] === undefined
    ) {
      return yield* Effect.fail(
        makeZerospinError('agent-aggregate-unavailable'),
      );
    }
    const { systemId } = yield* Initialized;
    const repos = yield* SystemRepos;
    const systemRepo = yield* repos.getRepo({ key: { systemId } });
    return yield* Effect.promise(() =>
      systemRepo.getAggregateIds({ aggregateName }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
