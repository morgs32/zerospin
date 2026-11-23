import * as sdk from '@zerospin/sdk/browser';

import { LabelEvidence } from '../../../ShoppingEvidence';
import { purchase } from '../models/purchase/purchase';

export const createExternalTrackingLabelDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'createExternalTrackingLabel',
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
    },
    response: LabelEvidence,
  });
