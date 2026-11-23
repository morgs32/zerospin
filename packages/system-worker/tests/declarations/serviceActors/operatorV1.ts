import { RoutePattern } from '@remix-run/route-pattern';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import * as Schema from 'effect/Schema';

import { createReservationV1 as createReservation } from '../contracts/createReservationV1.ts';
import { performReservationWorkV1 as performReservationWork } from '../contracts/performReservationWorkV1.ts';
import { reservationV1 as reservation } from '../models/reservationV1.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

export const operatorV1 = makeServiceActorRelease(
  { name: 'operator' },
  {
    version: 1,
    db: reservationQueries,
    exposedModels: { reservation },
    identity: makeActorIdentity({
      claims: Schema.Struct({
        viewerId: Schema.String,
        department: Schema.String,
      }),
      actorPath: RoutePattern.parse('/:viewerId'),
    }),
    authentication: 'none',
    contracts: {
      performReservationWork,
      createReservation,
    },
    selections: {
      reservation: reservationQueries.query.reservation.findMany({}),
    },
  },
);
