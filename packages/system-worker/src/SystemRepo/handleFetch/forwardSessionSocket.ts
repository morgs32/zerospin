import * as Effect from 'effect/Effect';

import {
  getAggregateActorVersionChain,
  getAggregateAgentVersionChain,
  getServiceActorVersionChain,
  getServiceAgentVersionChain,
} from '../../ownerOperations/releaseRepoNamespaces.js';
import type { ISessionAdmission } from '../sessionWebSocketTickets/SessionAdmissionSchema.js';

/** Derive the sole destination from spent admission, synthesize trusted headers, then forward outside SQL. */
export const forwardSessionSocket = Effect.fn(
  'SystemRepo.forwardSessionSocket',
)(function* (props: {
  request: Request;
  systemId: string;
  admission: ISessionAdmission;
}) {
  const { admission, systemId, request: inputRequest } = props;
  const url = new URL(inputRequest.url);
  url.search = '';
  const request = new Request(url, inputRequest);
  for (const name of Array.from(request.headers.keys())) {
    if (name.toLowerCase().startsWith('x-zerospin-')) {
      request.headers.delete(name);
    }
  }
  const headers = request.headers;
  const owner =
    admission.kind === 'serviceAgent'
      ? yield* Effect.gen(function* () {
          const repo = yield* getServiceAgentVersionChain({
            key: {
              systemId,
              serviceName: admission.serviceName,
              serviceVersion: admission.serviceVersion,
              agentName: admission.serviceAgentSessionLock.agentName,
              agentVersion: admission.serviceAgentSessionLock.agentVersion,
            },
          });
          headers.set(
            'x-zerospin-origin',
            JSON.stringify({
              kind: 'agent',
              agentName: admission.serviceAgentSessionLock.agentName,
              agentVersion: admission.serviceAgentSessionLock.agentVersion,
            }),
          );
          headers.set('x-zerospin-producer', JSON.stringify(admission.nodeId));
          headers.set('x-zerospin-service-name', admission.serviceName);
          headers.set(
            'x-zerospin-service-version',
            String(admission.serviceVersion),
          );
          headers.set(
            'x-zerospin-service-agent-session-lock',
            JSON.stringify(admission.serviceAgentSessionLock),
          );
          return repo;
        })
      : admission.kind === 'serviceActor'
        ? yield* Effect.gen(function* () {
            const repo = yield* getServiceActorVersionChain({
              key: {
                systemId,
                serviceName: admission.serviceName,
                serviceVersion: admission.serviceVersion,
                actorName: admission.serviceSessionLock.actorName,
                actorVersion: admission.serviceSessionLock.actorVersion,
                actorPath: admission.actorPath,
              },
            });
            headers.set(
              'x-zerospin-producer',
              JSON.stringify(admission.nodeId),
            );
            headers.set('x-zerospin-service-name', admission.serviceName);
            headers.set(
              'x-zerospin-service-version',
              String(admission.serviceVersion),
            );
            headers.set('x-zerospin-actor-path', admission.actorPath);
            headers.set('x-zerospin-claims', JSON.stringify(admission.claims));
            headers.set(
              'x-zerospin-session-name',
              admission.serviceSessionLock.sessionName,
            );
            headers.set(
              'x-zerospin-service-session-lock',
              JSON.stringify(admission.serviceSessionLock),
            );
            return repo;
          })
        : yield* Effect.gen(function* () {
            const common = {
              systemId,
              aggregateId: admission.aggregateId,
              aggregateName: admission.aggregateName,
              aggregateVersion: admission.aggregateVersion,
            };
            const repo =
              admission.kind === 'aggregateActor'
                ? yield* getAggregateActorVersionChain({
                    key: {
                      ...common,
                      actorName:
                        admission.aggregateSessionLock.origin.actorName,
                      actorVersion:
                        admission.aggregateSessionLock.origin.actorVersion,
                      actorPath: admission.actorPath,
                    },
                  })
                : yield* getAggregateAgentVersionChain({
                    key: {
                      ...common,
                      agentName:
                        admission.aggregateSessionLock.origin.agentName,
                      agentVersion:
                        admission.aggregateSessionLock.origin.agentVersion,
                    },
                  });
            if (admission.kind === 'aggregateActor') {
              headers.set(
                'x-zerospin-claims',
                JSON.stringify(admission.claims),
              );
            } else {
              headers.set(
                'x-zerospin-origin',
                JSON.stringify(admission.aggregateSessionLock.origin),
              );
            }
            headers.set(
              'x-zerospin-producer',
              JSON.stringify(admission.nodeId),
            );
            headers.set(
              'x-zerospin-aggregate-session-lock',
              JSON.stringify(admission.aggregateSessionLock),
            );
            return repo;
          });
  return yield* Effect.promise(async () => {
    const response = await owner.fetch(request);
    if (!(response instanceof Response)) {
      throw new Error('Session owner returned a non-Response result');
    }
    return response;
  }).pipe(
    Effect.catchCause(() =>
      Effect.succeed(
        Response.json(
          { message: 'Failed to forward WebSocket connection' },
          { status: 500 },
        ),
      ),
    ),
  );
});
