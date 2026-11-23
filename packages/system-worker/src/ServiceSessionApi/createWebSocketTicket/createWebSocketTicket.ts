import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { serviceActorVersionChainNameUtils } from '../../ServiceActorVersionChain/serviceActorVersionChainName.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { Initialized } from '../Initialized.js';

/** Decode the request before executing the authorized session operation. */
export const createWebSocketTicket = rpcMethod({
  name: 'ServiceSessionApi.createWebSocketTicket',
  schema: rpcRequestSchema(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([Schema.Struct({ serviceVersion: VersionSchema })]),
      ),
    ),
  ),
  parseError: {
    code: 'service-session-api-arguments-invalid',
    prefix:
      'ServiceSessionApi.createWebSocketTicket received invalid arguments',
  },
  linked: true,
})(
  function* (args) {
    const [{ serviceVersion }] = args;
    const authResults = yield* Initialized;
    const system = readExecutingSystemSpec();
    if (
      !Object.hasOwn(
        system.services[authResults.serviceName]?.releases ?? {},
        authResults.serviceVersion,
      ) ||
      serviceVersion !== authResults.serviceVersion
    ) {
      return yield* makeZerospinError({
        code: 'service-version-unavailable',
        message:
          'The requested version is not available through this capability',
      });
    }
    return yield* Effect.gen(function* () {
      const {
        serviceSessionLock,
        serviceName,
        claims,
        actorPath,

        systemId: configuredSystemId,
      } = authResults;

      // decode configuredSystemId as the system abbreviation ID
      const systemId = yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(coreAbbreviations.system),
      )(configuredSystemId).pipe(
        mapParseError({
          code: 'service-session-websocket-ticket-system-id-invalid',
          prefix: 'Failed to decode service definition ticket systemId',
        }),
      );

      // use the bound Service release and Actor identity from the full lock
      const key = {
        systemId,
        serviceName,
        serviceVersion,
        actorPath,
        actorName: serviceSessionLock.actorName,
        actorVersion: serviceSessionLock.actorVersion,
      };
      const repoName = yield* serviceActorVersionChainNameUtils.makeName(key);

      // read SystemRepo registrations before issuing a ticket
      const systemRepos = yield* SystemRepos;
      const systemRepo = yield* systemRepos.getRepo({
        key: {
          systemId,
        },
      });
      const projectionRegistrations = yield* Effect.promise(() =>
        systemRepo.getRepoRegistrations({
          repoType: 'ServiceActorVersionChain',
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

      // return service-session-state-required when the exact projection name is absent
      if (
        !projectionRegistrations.some(
          registration => registration.repoName === repoName,
        )
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'service-session-state-required',
            message:
              'Service definition state must initialize before a WebSocket ticket can be created',
            extra: {
              serviceName,
              serviceVersion,
              claims,
              actorPath,
              sessionName: serviceSessionLock.sessionName,
            },
          }),
        );
      }

      // retain the full declaration lock and exact Actor Chain admission
      const ticket = yield* Effect.promise(() =>
        systemRepo.createSessionWebSocketTicket({
          admission: {
            kind: 'serviceActor',
            nodeId: null,
            serviceName,
            serviceVersion,
            claims,
            actorPath,
            serviceSessionLock,
          },
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

      // supply the ticket for the subsequent WebSocket upgrade
      return { ticket };
    });
  },
  {
    onSuccess: success => ({ _tag: 'Success' as const, success }),
    onFailure: failure => ({ _tag: 'Failure' as const, failure }),
  },
);
