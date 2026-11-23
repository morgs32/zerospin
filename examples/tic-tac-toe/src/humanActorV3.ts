import { updateAggregateActorRelease } from '@zerospin/core/aggregateActor/updateAggregateActorRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';

import { savePositionV2 } from './contracts/savePositionV2';
import { game } from './gameV1';
import { humanV2 } from './humanActorV2';
import { savedPositionV2 } from './savedPositionV2';

const db = makeQueryDbVersion({
  models: { game, savedPosition: savedPositionV2 },
});
const identity = humanV2.identity;

export const humanV3 = updateAggregateActorRelease(humanV2, {
  version: 3,
  db,
  exposedModels: db.models,
  selections: {
    game: db.query.game.findMany({
      where: { id: { eq: identity.sql.placeholder('instanceId') } },
    }),
    savedPosition: db.query.savedPosition.findMany({
      where: { gameId: { eq: identity.sql.placeholder('instanceId') } },
    }),
  },
  contracts: { savePosition: savePositionV2 },
});
