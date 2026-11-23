import { updateAggregateActorRelease } from '@zerospin/core/aggregateActor/updateAggregateActorRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';

import { savePositionV1 } from './contracts/savePositionV1';
import { game } from './gameV1';
import { human } from './humanActorV1';
import { savedPositionV1 } from './savedPositionV1';

const db = makeQueryDbVersion({
  models: { game, savedPosition: savedPositionV1 },
});
const identity = human.identity;

export const humanV2 = updateAggregateActorRelease(human, {
  version: 2,
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
  contracts: { savePosition: savePositionV1 },
});
