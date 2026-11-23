import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';

import { reservationV1 as reservation } from '../models/reservationV1.ts';

import { operatorV1 as operator } from './operatorV1.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

export const auditorV1 = makeServiceActorRelease(
  { name: 'auditor' },
  {
    version: 1,
    db: reservationQueries,
    exposedModels: { reservation },
    identity: operator.identity,
    authentication: 'none',
    contracts: {},
    selections: {
      reservation: reservationQueries.query.reservation.findMany({}),
    },
  },
);
