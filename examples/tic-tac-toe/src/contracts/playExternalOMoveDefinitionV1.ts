import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

import { gameModel } from '../gameModel';

export const playExternalOMoveDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'playExternalOMove',
    version: 1,
    payload: {
      id: sdk.modelId({ model: gameModel }),
      board: sdk.primitives.text(),
    },
    response: Schema.Int,
  });
