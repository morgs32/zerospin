import * as sdk from '@zerospin/sdk/browser';

import { TrackingEvidence } from '../../../ShoppingEvidence';
import { purchase } from '../models/purchase/purchase';

export const refreshExternalTrackingInfoDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'refreshExternalTrackingInfo',
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      labelReference: sdk.primitives.text(),
      sequence: sdk.primitives.integer(),
    },
    response: TrackingEvidence,
  });
