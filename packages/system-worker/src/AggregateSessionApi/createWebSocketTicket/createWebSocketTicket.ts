import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { aggregateActorVersionChainNameUtils } from '../../AggregateActorVersionChain/aggregateActorVersionChainName.js';
import { rpcMethod, rpcRequestSchema } from '../../makeRpcApi/makeRpcApi.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { Initialized } from '../Initialized.js';

/** Decode the request before executing the authorized session operation. */
export const createWebSocketTicket = rpcMethod({
  name: 'AggregateSessionApi.createWebSocketTicket',
  schema: rpcRequestSchema(Schema.declare<[]>((_input): _input is [] => true)),
  parseError: {
    code: 'aggregate-session-api-arguments-invalid',
    prefix:
      'AggregateSessionApi.createWebSocketTicket received invalid arguments',
  },
  linked: true,
})(
  function* (_args) {
    const authResults = yield* Initialized;
    const system = readExecutingSystemSpec();
    if (
      !Object.hasOwn(
        system.aggregates[authResults.aggregateName]?.releases ?? {},
        authResults.aggregateVersion,
      )
    ) {
      return yield* makeZerospinError('aggregate-version-unavailable');
    }
    return yield* Effect.gen(function* () {
      const {
        aggregateSessionLock,
        aggregateId,
        aggregateName,
        aggregateVersion,
        claims,
        actorName,
        actorVersion,
        actorPath,

        systemId: configuredSystemId,
      } = authResults;
      // decode configuredSystemId as the system abbreviation ID
      const systemId = yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(coreAbbreviations.system),
      )(configuredSystemId).pipe(
        mapParseError({
          code: 'aggregate-session-websocket-ticket-system-id-invalid',
          prefix: 'Failed to decode aggregate definition ticket systemId',
        }),
      );

      // use the bound aggregate version and actor projection identity
      const key = {
        systemId,
        aggregateId,
        aggregateName,
        aggregateVersion,
        actorName,
        actorVersion,
        actorPath,
      };
      const repoName = yield* aggregateActorVersionChainNameUtils.makeName(key);

      // read SystemRepo registrations before issuing a ticket
      const systemRepos = yield* SystemRepos;
      const systemRepo = yield* systemRepos.getRepo({
        key: {
          systemId,
        },
      });
      const aggregateSessionRegistrations = yield* Effect.promise(() =>
        systemRepo.getRepoRegistrations({
          repoType: 'AggregateActorVersionChain',
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

      // return aggregate-session-state-required when the exact projection name is absent
      if (
        !aggregateSessionRegistrations.some(
          registration => registration.repoName === repoName,
        )
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'aggregate-session-state-required',
            message:
              'Session state must initialize before a WebSocket ticket can be created',
            extra: {
              aggregateId,
              claims,
              actorName,
              actorVersion,
              actorPath,
              sessionName: aggregateSessionLock.sessionName,
            },
          }),
        );
      }

      // retain the full declaration lock and exact Actor Chain admission
      const ticket = yield* Effect.promise(() =>
        systemRepo.createSessionWebSocketTicket({
          admission: {
            kind: 'aggregateActor',
            actorPath,
            aggregateVersion,
            aggregateId,
            aggregateName,
            claims,
            nodeId: null,
            aggregateSessionLock,
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
