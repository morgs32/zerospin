import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import * as Effect from 'effect/Effect';

import { reservationV1 as reservation } from '../models/reservationV1.ts';

export const probeCapabilityV1 = makeServiceContractRelease(
  defineServiceContract('probeCapability'),
  {
    version: 1,
    payload: {},
    models: {
      reservation: {
        model: reservation,
        fields: ['createdAt', 'updatedAt', 'expiresAt'],
      },
    },
    program: () => Effect.void,
  },
);
