/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { ShoppingProviders } from '../../../ShoppingProviders';

import { applyTrackingLabelV1 } from './applyTrackingLabelV1';
import { createExternalTrackingLabelDefinitionV1 } from './createExternalTrackingLabelDefinitionV1';

export const createExternalTrackingLabelV1 =
  sdk.makeAggregateExternalContractRelease(
    createExternalTrackingLabelDefinitionV1,
    {
      request: ({ payload }) =>
        ShoppingProviders.use(provider => provider.createLabel(payload)),
      onSuccess: {
        contract: applyTrackingLabelV1,
        payload: Effect.fn('createExternalTrackingLabelV1.onSuccess')(
          function* ({ payload, response }) {
            return { ...payload, label: response };
          },
        ),
      },
      onFailure: {
        contract: applyTrackingLabelV1,
        payload: Effect.fn('createExternalTrackingLabelV1.onFailure')(
          function* ({ payload }) {
            return { ...payload, label: null };
          },
        ),
      },
    },
  );
