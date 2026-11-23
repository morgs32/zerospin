/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { ShoppingProviders } from '../../../ShoppingProviders';

import { applyPaymentObservationV1 } from './applyPaymentObservationV1';
import { markPaymentForReconciliationV1 } from './markPaymentForReconciliationV1';
import { processExternalPaymentDefinitionV1 } from './processExternalPaymentDefinitionV1';

export const processExternalPaymentV1 =
  sdk.makeAggregateExternalContractRelease(processExternalPaymentDefinitionV1, {
    request: ({ payload }) =>
      ShoppingProviders.use(provider => provider.pay(payload)),
    onSuccess: {
      contract: applyPaymentObservationV1,
      payload: Effect.fn('processExternalPaymentV1.onSuccess')(function* ({
        payload,
        response,
      }) {
        return {
          purchaseId: payload.purchaseId,
          key: payload.key,
          total: payload.total,
          providerKey: response.key,
          providerTotal: response.total,
          state: response.state,
          reference: response.reference,
          evidence: response.evidence,
        };
      }),
    },
    onFailure: {
      contract: markPaymentForReconciliationV1,
      payload: Effect.fn('processExternalPaymentV1.onFailure')(function* ({
        payload,
      }) {
        return {
          purchaseId: payload.purchaseId,
          key: payload.key,
          total: payload.total,
        };
      }),
    },
  });
