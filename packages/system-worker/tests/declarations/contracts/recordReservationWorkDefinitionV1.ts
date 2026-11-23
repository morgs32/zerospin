import { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
import { primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

export const recordReservationWorkDefinitionV1 = defineServiceExternalContract({
  name: 'recordReservationWork',
  version: 1,
  payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
  response: Schema.Null,
});
