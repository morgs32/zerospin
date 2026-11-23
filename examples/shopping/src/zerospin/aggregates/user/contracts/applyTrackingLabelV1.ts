import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { LabelEvidence } from '../../../ShoppingEvidence';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const applyTrackingLabelV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyTrackingLabel'),
  {
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      label: sdk.primitives.json({ schema: LabelEvidence, nullable: true }),
    },
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
    failures: {
      staleObservation: sdk.ContractError.schema({
        code: 'stale-provider-observation',
      }),
    },
    operations: { updatePurchase: purchaseV1.operations.update },
    program: Effect.fn('applyTrackingLabelV1.program')(function* ({
      payload,
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
        purchase.labelState !== 'requested' ||
        (payload.label !== null && payload.label.key !== payload.key)
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Label evidence no longer matches its paid purchase reservation.',
        });
      }
      if (payload.label === null) {
        yield* operations.updatePurchase({
          resourceId: purchase.id,
          attributes: { labelState: 'needs_reconciliation' },
        });
        return;
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          labelState: 'ready',
          labelReference: payload.label.labelReference,
          trackingNumber: payload.label.trackingNumber,
          trackingStatus: payload.label.status,
        },
      });
    }),
  },
);
