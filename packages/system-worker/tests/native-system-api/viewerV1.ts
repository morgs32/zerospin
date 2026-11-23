import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';

const accountQueries = makeQueryDbVersion({
  models: { agentReservation: agentReservationV1 },
});

export const viewerV1 = makeAggregateActorRelease(
  { name: 'viewer' },
  {
    version: 1,
    db: accountQueries,
    exposedModels: { agentReservation: agentReservationV1 },
    identity: makeActorIdentity({
      claims: Schema.Struct({
        aggregateId: Schema.String,
        viewerId: Schema.String,
      }),
      actorPath: RoutePattern.parse('/:viewerId'),
    }),
    authentication: {
      credentialsSchema: Schema.Struct({ viewerId: Schema.String }),
      authenticate: ({ aggregateId, credentials }) => {
        if (credentials.viewerId === 'refused') {
          return Effect.fail(
            makeZerospinError('fixture-aggregate-authentication-refused'),
          );
        }
        return Effect.succeed({
          aggregateId:
            credentials.viewerId === 'mismatched'
              ? 'acc_different'
              : aggregateId,
          ...credentials,
        });
      },
    },
    authorize: ({ sessionName }) =>
      sessionName === 'refused'
        ? Effect.fail(
            makeZerospinError('fixture-aggregate-authorization-refused'),
          )
        : Effect.void,
    selections: {},
    contracts: {},
  },
);
