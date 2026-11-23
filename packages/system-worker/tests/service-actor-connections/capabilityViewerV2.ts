import { RoutePattern } from '@remix-run/route-pattern';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import * as Schema from 'effect/Schema';

import { createReservationV1 as createReservation } from '../declarations/contracts/createReservationV1.ts';
import { performReservationWorkV1 as performReservationWork } from '../declarations/contracts/performReservationWorkV1.ts';
import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

import { probeCapabilityV2 as probeCapability2 } from './probeCapabilityV2.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

const capabilityIdentity = makeActorIdentity({
  claims: Schema.Struct({ reservationId: Schema.String, role: Schema.String }),
  actorPath: RoutePattern.parse('/:reservationId'),
});

export const capabilityViewerV2 = makeServiceActorRelease(
  { name: 'capabilityViewer' },
  {
    version: 2,
    db: reservationQueries,
    exposedModels: { reservation },
    identity: capabilityIdentity,
    authentication: 'none',
    contracts: {
      createReservation,
      performReservationWork,
      probeCapability: probeCapability2,
    },
    selections: {
      reservation: reservationQueries.query.reservation.findMany({
        where: {
          id: { eq: capabilityIdentity.sql.placeholder('reservationId') },
        },
      }),
    },
  },
);
