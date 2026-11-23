import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { deterministicComputerMove } from './chooseComputerMove';
import { aggregateRelease as gameReleaseV1 } from './gameAggregateReleaseV1';
import { gameReleaseV2 } from './gameAggregateReleaseV2';
import { game } from './gameV1';
import { humanV3 } from './humanActorV3';
import { savedPositionV2 } from './savedPositionV2';

export const gameReleaseV3 = makeAggregateRelease(gameReleaseV2.definition, {
  version: 3,
  layer: deterministicComputerMove,
  rebuildFrom: gameReleaseV2,
  models: { game, savedPosition: savedPositionV2 },
  actors: { human: humanV3 },
  guards: gameReleaseV1.guards,
  external: gameReleaseV2.external,
  contracts: { applyComputerMove: gameReleaseV2.contracts.applyComputerMove },
});
