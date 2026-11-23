import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

import { SavedPositionContentV1, savedPositionV1 } from './savedPositionV1';

export const SavedPositionContentV2 = Schema.Struct({
  ...SavedPositionContentV1.fields,
  turn: Schema.NullOr(Schema.Literals(['X', 'O'])),
});

export const savedPositionV2 = sdk.upgradeModelVersion(savedPositionV1, {
  version: 2,
  attributes: {
    content: sdk.primitives.json({ schema: SavedPositionContentV2 }),
  },
});
