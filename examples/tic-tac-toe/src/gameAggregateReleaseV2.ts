import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { deterministicComputerMove } from './chooseComputerMove';
import { aggregateRelease as gameReleaseV1 } from './gameAggregateReleaseV1';
import { game } from './gameV1';
import { humanV2 } from './humanActorV2';
import { savedPositionV1 } from './savedPositionV1';

export const gameReleaseV2 = makeAggregateRelease(gameReleaseV1.definition, {
  version: 2,
  layer: deterministicComputerMove,
  branchFrom: gameReleaseV1,
  models: { game, savedPosition: savedPositionV1 },
  actors: { human: humanV2 },
  guards: gameReleaseV1.guards,
  external: gameReleaseV1.external,
  contracts: { applyComputerMove: gameReleaseV1.contracts.applyComputerMove },
});
