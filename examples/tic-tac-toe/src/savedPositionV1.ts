import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

import { gameModel } from './gameModel';
import { savedPositionModel } from './savedPositionModel';

export const SavedPositionContentV1 = Schema.Struct({ board: Schema.String });

export const savedPositionV1 = sdk.makeModelVersion(savedPositionModel, {
  version: 1,
  attributes: {
    gameId: sdk.modelRef({
      model: gameModel,
      relation: 'game',
      inverse: 'savedPositions',
    }),
    content: sdk.primitives.json({ schema: SavedPositionContentV1 }),
  },
  indexes: [],
});
