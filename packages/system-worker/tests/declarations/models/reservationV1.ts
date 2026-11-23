import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/shapes';

export const reservationV1 = makeModelVersion(
  defineModel({ name: 'reservation', abbreviation: 'rsv' }),
  { version: 1, attributes: { expiresAt: primitives.integer() }, indexes: [] },
);
