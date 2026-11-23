import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import {
  performReservationWorkV1,
  reservationWorkEvaluations,
} from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  models: { reservation: reservationV1 },
  actors: {},
  system: { performReservationWork: performReservationWorkV1 },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});

export const replayEvaluationsPath = '/__workerd/service-replay-evaluations';

export function observeReplayFixture(request: Request): Response | undefined {
  if (new URL(request.url).pathname === replayEvaluationsPath) {
    return Response.json(reservationWorkEvaluations);
  }
}
