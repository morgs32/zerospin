import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { TrackingEvidence } from '../../../ShoppingEvidence';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const applyTrackingRefreshV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyTrackingRefresh'),
  {
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      labelReference: sdk.primitives.text(),
      sequence: sdk.primitives.integer(),
      tracking: sdk.primitives.json({
        schema: TrackingEvidence,
        nullable: true,
      }),
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
    program: Effect.fn('applyTrackingRefreshV1.program')(function* ({
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
        purchase.labelState !== 'ready' ||
        !purchase.trackingRefreshPending ||
        purchase.labelReference !== payload.labelReference ||
        purchase.trackingRefreshSequence !== payload.sequence ||
        (payload.tracking !== null &&
          (payload.tracking.key !== payload.key ||
            payload.tracking.labelReference !== payload.labelReference ||
            payload.tracking.sequence !== payload.sequence))
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Tracking evidence does not match the reserved label and refresh sequence.',
        });
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          ...(payload.tracking === null
            ? {}
            : { trackingStatus: payload.tracking.status }),
          trackingRefreshPending: false,
        },
      });
    }),
  },
);
