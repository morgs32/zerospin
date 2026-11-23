import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/shapes';

export const agentReservationV1 = makeModelVersion(
  defineModel({ name: 'agentReservation', abbreviation: 'arv' }),
  { version: 1, attributes: { expiresAt: primitives.integer() }, indexes: [] },
);
