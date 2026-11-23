import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { aggregateRelease } from './gameAggregateReleaseV1';
import { gameReleaseV2 } from './gameAggregateReleaseV2';
import { gameReleaseV3 } from './gameAggregateReleaseV3';

export const system = makeSystem({
  name: 'tic-tac-toe',
  aggregates: {
    game: {
      releases: { 1: aggregateRelease, 2: gameReleaseV2, 3: gameReleaseV3 },
    },
  },
});
