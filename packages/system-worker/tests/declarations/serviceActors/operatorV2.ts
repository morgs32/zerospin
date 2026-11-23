import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';

import { createReservationV1 as createReservation } from '../contracts/createReservationV1.ts';
import { performReservationWorkV1 as performReservationWork } from '../contracts/performReservationWorkV1.ts';
import { reservationV1 as reservation } from '../models/reservationV1.ts';

import { operatorV1 as operator } from './operatorV1.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

export const operatorV2 = makeServiceActorRelease(
  { name: 'operator' },
  {
    version: 2,
    db: reservationQueries,
    exposedModels: { reservation },
    identity: operator.identity,
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
