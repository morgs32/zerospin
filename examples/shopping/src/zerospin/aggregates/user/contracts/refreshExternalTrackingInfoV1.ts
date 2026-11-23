/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { ShoppingProviders } from '../../../ShoppingProviders';

import { applyTrackingRefreshV1 } from './applyTrackingRefreshV1';
import { refreshExternalTrackingInfoDefinitionV1 } from './refreshExternalTrackingInfoDefinitionV1';

export const refreshExternalTrackingInfoV1 =
  sdk.makeAggregateExternalContractRelease(
    refreshExternalTrackingInfoDefinitionV1,
    {
      request: ({ payload }) =>
        ShoppingProviders.use(provider => provider.refresh(payload)),
      onSuccess: {
        contract: applyTrackingRefreshV1,
        payload: Effect.fn('refreshExternalTrackingInfoV1.onSuccess')(
          function* ({ payload, response }) {
            return { ...payload, tracking: response };
          },
        ),
      },
      onFailure: {
        contract: applyTrackingRefreshV1,
        payload: Effect.fn('refreshExternalTrackingInfoV1.onFailure')(
          function* ({ payload }) {
            return { ...payload, tracking: null };
          },
        ),
      },
    },
  );
