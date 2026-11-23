import * as sdk from '@zerospin/sdk/browser';

import { promotionReservation } from '../../../../services/promotion/models/promotionReservation/promotionReservation';
import { cart } from '../cart/cart';

import { purchase } from './purchase';
export const purchaseV1 = sdk.makeModelVersion(purchase, {
  version: 1,
  attributes: {
    cartId: sdk.modelId({ model: cart }),
    reservationId: sdk.modelId({ model: promotionReservation, nullable: true }),
    subtotal: sdk.primitives.integer({ nullable: true }),
    discount: sdk.primitives.integer({ nullable: true }),
    total: sdk.primitives.integer({ nullable: true }),
    paymentState: sdk.primitives.enum({
      values: [
        'preparing',
        'pending',
        'paid',
        'declined',
        'refused',
        'needs_reconciliation',
      ],
    }),
    paymentReference: sdk.primitives.text({ nullable: true }),
    paymentEvidence: sdk.primitives.text({ nullable: true }),
    labelState: sdk.primitives.enum({
      values: ['none', 'requested', 'ready', 'needs_reconciliation'],
    }),
    labelReference: sdk.primitives.text({ nullable: true }),
    trackingNumber: sdk.primitives.text({ nullable: true }),
    trackingStatus: sdk.primitives.enum({
      nullable: true,
      values: ['pre_transit', 'in_transit', 'delivered'],
    }),
    trackingRefreshSequence: sdk.primitives.integer(),
    trackingRefreshPending: sdk.primitives.boolean(),
  },
  indexes: [],
});
