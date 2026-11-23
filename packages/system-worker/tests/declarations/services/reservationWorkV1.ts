import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeServiceContractExtension } from '@zerospin/core/contracts/makeServiceContractExtension';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import * as Effect from 'effect/Effect';

import { performReservationWorkV1 } from '../contracts/performReservationWorkV1.ts';
import { recordReservationWorkDefinitionV1 } from '../contracts/recordReservationWorkDefinitionV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../models/reservationV1.ts';

import { reservationService } from './reservationService.ts';

export const reservationWorkV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {},
  extensions: {
    performReservationWork: makeServiceContractExtension(
      performReservationWorkV1,
      {
        models: {
          reservation: { model: reservationV1, fields: ['expiresAt'] },
        },
        operations: {
          update: reservationV1.operations.update,
          record: recordReservationWorkDefinitionV1.externalOperation,
        },
        program: Effect.fn(function* ({ db, operations, payload, failures }) {
          if (payload.mode !== 'extend' && payload.mode !== 'rejectExtension') {
            return;
          }
          const row = yield* findFirst({
            db,
            model: db.models.reservation,
            where: { id: { eq: payload.reservationId } },
          });
          if (!row || payload.mode === 'rejectExtension') {
            return yield* failures.refused.make({
              message: 'Extension refused',
            });
          }
          yield* operations.update({
            resourceId: row.id,
            attributes: { expiresAt: row.expiresAt + 10 },
          });
          yield* operations.record({ payload: { reservationId: row.id } });
        }),
      },
    ),
  },
  system: { performReservationWork: performReservationWorkV1 },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
