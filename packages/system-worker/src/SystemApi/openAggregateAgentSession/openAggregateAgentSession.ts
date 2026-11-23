import { OpenAggregateAgentSessionRequestSchema } from '@zerospin/core/systemApi/OpenAggregateAgentSessionRequestSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { AggregateAgentVersionRepos } from '../../repoServices/AggregateAgentVersionRepos.js';
import { projectAggregateAgentSessionLock } from '../../sessionLockValidation/projectAgentSessionLocks.js';

import { resolveRegisteredAggregateAgentSelection } from './resolveRegisteredAggregateAgentSelection.js';

/** Snapshot one exact declared Aggregate Agent and issue its bound observation ticket. */
export const openAggregateAgentSession = rpcMethod({
  name: 'SystemApi.openAggregateAgentSession',
  schema: rpcRequestSchema(
    Schema.mutable(Schema.Tuple([OpenAggregateAgentSessionRequestSchema])),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.openAggregateAgentSession received invalid arguments',
  },
  linked: true,
})(
  function* ([request]) {
    const { agent, systemRepo, key } =
      yield* resolveRegisteredAggregateAgentSelection(request);
    const aggregateSessionLock = projectAggregateAgentSessionLock(agent);
    const projection = yield* (yield* AggregateAgentVersionRepos).getRepo({
      key,
    });
    const snapshot = yield* Effect.promise(() =>
      projection.getSnapshot({
        aggregateId: request.aggregateId,
        aggregateName: request.aggregateName,
        origin: aggregateSessionLock.origin,
        sessionName: agent.sessionName,
        nodeId: request.nodeId,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const ticket = yield* Effect.promise(() =>
      systemRepo.createSessionWebSocketTicket({
        admission: {
          kind: 'aggregateAgent',
          aggregateName: request.aggregateName,
          aggregateVersion: request.aggregateVersion,
          aggregateId: request.aggregateId,
          aggregateSessionLock,
          nodeId: request.nodeId,
        },
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    return { snapshot, ticket };
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
