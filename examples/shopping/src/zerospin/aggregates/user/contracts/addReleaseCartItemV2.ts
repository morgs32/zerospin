import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import {
  addReleaseCartItemV1,
  recordReleaseCartItem,
} from './addReleaseCartItemV1';

export const addReleaseCartItemV2 = sdk.upgradeAggregateContractRelease(
  addReleaseCartItemV1,
  {
    version: 2,
    down: ({ payload }) => Effect.succeed(payload),
    program: input => recordReleaseCartItem(input, 2),
  },
);
