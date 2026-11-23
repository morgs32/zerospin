import { OpenServiceAgentSessionRequestSchema } from '@zerospin/core/systemApi/OpenServiceAgentSessionRequestSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceAgentVersionRepos } from '../../repoServices/ServiceAgentVersionRepos.js';
import { projectServiceAgentSessionLock } from '../../sessionLockValidation/projectAgentSessionLocks.js';

import { resolveRegisteredServiceAgentSelection } from './resolveRegisteredServiceAgentSelection.js';

/** Snapshot one exact declared Service Agent and issue its bound observation ticket. */
export const openServiceAgentSession = rpcMethod({
  name: 'SystemApi.openServiceAgentSession',
  schema: rpcRequestSchema(
    Schema.mutable(Schema.Tuple([OpenServiceAgentSessionRequestSchema])),
  ),
  parseError: {
    code: 'system-api-arguments-invalid',
    prefix: 'SystemApi.openServiceAgentSession received invalid arguments',
  },
  linked: true,
})(
  function* ([request]) {
    const { agent, systemRepo, key } =
      yield* resolveRegisteredServiceAgentSelection(request);
    const serviceAgentSessionLock = projectServiceAgentSessionLock(agent);
    const projection = yield* (yield* ServiceAgentVersionRepos).getRepo({
      key,
    });
    const snapshot = yield* Effect.promise(() =>
      projection.getSnapshot({
        serviceAgentSessionLock,
        sessionName: agent.sessionName,
        nodeId: request.nodeId,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const ticket = yield* Effect.promise(() =>
      systemRepo.createSessionWebSocketTicket({
        admission: {
          kind: 'serviceAgent',
          serviceName: request.serviceName,
          serviceVersion: request.serviceVersion,
          serviceAgentSessionLock,
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
