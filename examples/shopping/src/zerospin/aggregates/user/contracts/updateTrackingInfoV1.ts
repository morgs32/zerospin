import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

import { refreshExternalTrackingInfoDefinitionV1 } from './refreshExternalTrackingInfoDefinitionV1';

const TrackingRefreshData = Schema.Struct({
  purchaseId: Schema.TemplateLiteral(['pur_', Schema.String]),
  labelReference: Schema.String,
  sequence: Schema.Number,
});
export const RequestedTrackingRefresh = sdk.ZerospinSuccess.schema({
  code: 'tracking-refresh-requested',
  data: TrackingRefreshData,
});
export const PendingTrackingRefresh = sdk.ZerospinSuccess.schema({
  code: 'tracking-refresh-pending',
  data: TrackingRefreshData,
});
export const UpdateTrackingInfoResult = Schema.Union([
  RequestedTrackingRefresh,
  PendingTrackingRefresh,
]);

export const updateTrackingInfoV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('updateTrackingInfo'),
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
      updateTrackingInfo:
        refreshExternalTrackingInfoDefinitionV1.externalOperation,
    },
    result: UpdateTrackingInfoResult,
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'tracking-label-unavailable',
      }),
    },
    program: Effect.fn('updateTrackingInfoV1.program')(function* ({
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
        purchase.labelState !== 'ready' ||
        !purchase.labelReference
      ) {
        return yield* failures.unavailable.make({
          message:
            'Tracking refresh requires a ready label on a paid purchase.',
        });
      }
      const labelReference = purchase.labelReference;
      if (purchase.trackingRefreshPending) {
        return PendingTrackingRefresh.make({
          data: {
            purchaseId: purchase.id,
            labelReference,
            sequence: purchase.trackingRefreshSequence,
          },
        });
      }
      const sequence = purchase.trackingRefreshSequence + 1;
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          trackingRefreshSequence: sequence,
          trackingRefreshPending: true,
        },
      });
      yield* operations.updateTrackingInfo({
        payload: {
          purchaseId: purchase.id,
          labelReference,
          sequence,
          key: `shopping:${aggregateId}:${purchase.id}:refresh:${sequence}`,
        },
      });
      return RequestedTrackingRefresh.make({
        data: { purchaseId: purchase.id, labelReference, sequence },
      });
    }),
  },
);
