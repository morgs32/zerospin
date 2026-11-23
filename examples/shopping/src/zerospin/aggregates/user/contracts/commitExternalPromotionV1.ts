import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { applyPromotionCommitmentV1 } from './applyPromotionCommitmentV1';
import { commitExternalPromotionDefinitionV1 } from './commitExternalPromotionDefinitionV1';
import { requestPromotionCommitment } from './utils/requestPromotionCommitment';

export const commitExternalPromotionV1 =
  sdk.makeAggregateExternalContractRelease(
    commitExternalPromotionDefinitionV1,
    {
      request: ({ payload }) => requestPromotionCommitment(payload),
      onSuccess: {
        contract: applyPromotionCommitmentV1,
        payload: Effect.fn('commitExternalPromotionV1.onSuccess')(function* ({
          payload,
          response,
        }) {
          return {
            ...payload,
            committed:
              response.status === 'committed' &&
              response.purchaseId === payload.purchaseId,
          };
        }),
      },
      onFailure: {
        contract: applyPromotionCommitmentV1,
        payload: Effect.fn('commitExternalPromotionV1.onFailure')(function* ({
          payload,
        }) {
          return { ...payload, committed: false };
        }),
      },
    },
  );
