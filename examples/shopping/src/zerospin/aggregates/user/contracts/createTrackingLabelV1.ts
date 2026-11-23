import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

import { createExternalTrackingLabelDefinitionV1 } from './createExternalTrackingLabelDefinitionV1';

export const CreateTrackingLabelResult = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  reserved: Schema.Boolean,
});

export const createTrackingLabelV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('createTrackingLabel'),
  {
    version: 1,
    payload: { purchaseId: sdk.modelId({ model: purchase }) },
    models: {
      purchase: {
        model: purchaseV1,
        fields: [
          'createdAt',
          'updatedAt',
          'cartId',
          'reservationId',
          'subtotal',
          'discount',
          'total',
          'paymentState',
          'paymentReference',
          'paymentEvidence',
          'labelState',
          'labelReference',
          'trackingNumber',
          'trackingStatus',
          'trackingRefreshSequence',
          'trackingRefreshPending',
        ],
      },
    },
    operations: {
      updatePurchase: purchaseV1.operations.update,
      createTrackingLabel:
        createExternalTrackingLabelDefinitionV1.externalOperation,
    },
    result: CreateTrackingLabelResult,
    failures: {
      ineligible: sdk.ContractError.schema({ code: 'purchase-not-paid' }),
    },
    program: Effect.fn('createTrackingLabelV1.program')(function* ({
      payload,
      aggregateId,
      db,
      failures,
      operations,
    }) {
      const purchase = yield* sdk.findFirst({
        db,
        model: db.models.purchase,
        where: { id: { eq: payload.purchaseId } },
      });
      if (
        !purchase ||
        purchase.paymentState !== 'paid' ||
        !purchase.paymentReference ||
        !purchase.paymentEvidence
      ) {
        return yield* failures.ineligible.make({
          message:
            'Tracking labels require authoritative successful payment evidence.',
        });
      }
      if (purchase.labelState !== 'none') {
        return { purchaseId: purchase.id, reserved: false };
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: { labelState: 'requested' },
      });
      yield* operations.createTrackingLabel({
        payload: {
          purchaseId: purchase.id,
          key: `shopping:${aggregateId}:${purchase.id}:label`,
        },
      });
      return { purchaseId: purchase.id, reserved: true };
    }),
  },
);
