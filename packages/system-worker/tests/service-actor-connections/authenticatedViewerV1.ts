import { RoutePattern } from '@remix-run/route-pattern';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

const capabilityIdentity = makeActorIdentity({
  claims: Schema.Struct({ reservationId: Schema.String, role: Schema.String }),
  actorPath: RoutePattern.parse('/:reservationId'),
});

export const authenticatedViewerV1 = makeServiceActorRelease(
  { name: 'authenticatedViewer' },
  {
    version: 1,
    db: reservationQueries,
    exposedModels: { reservation },
    identity: capabilityIdentity,
    authentication: {
      credentialsSchema: Schema.Struct({ token: Schema.String }),
      authenticate: ({ credentials }) => {
        if (
          credentials.token !== 'reader' &&
          credentials.token !== 'invalid-result'
        ) {
          return Effect.fail(makeZerospinError('fixture-credentials-refused'));
        }
        return Effect.succeed({
          reservationId: 'rsv_authenticated',
          role: 'reader',
          ...(credentials.token === 'invalid-result'
            ? { untrusted: true }
            : {}),
        });
      },
    },
    contracts: {},
    selections: {
      reservation: reservationQueries.query.reservation.findMany({
        where: {
          id: { eq: capabilityIdentity.sql.placeholder('reservationId') },
        },
      }),
    },
  },
);
