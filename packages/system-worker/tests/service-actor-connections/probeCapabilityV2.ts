import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import * as Effect from 'effect/Effect';

import { probeCapabilityV1 as probeCapability } from '../declarations/contracts/probeCapabilityV1.ts';

export const probeCapabilityV2 = upgradeServiceContractRelease(
  probeCapability,
  {
    version: 2,
    up: () => Effect.succeed({}),
    program: () => Effect.void,
  },
);
