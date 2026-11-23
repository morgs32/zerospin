import * as sdk from '@zerospin/sdk/browser';

import { cart } from '../../../../aggregates/user/models/cart/cart';
import { purchase } from '../../../../aggregates/user/models/purchase/purchase';

import { promotionReservation } from './promotionReservation';

export const promotionReservationV1 = sdk.makeModelVersion(
  promotionReservation,
  {
    version: 1,
    attributes: {
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
      purchaseId: sdk.modelId({
        model: purchase,
        nullable: true,
      }),
      expiresAt: sdk.primitives.integer({ nullable: true }),
      status: sdk.primitives.enum({
        values: ['reserved', 'denied', 'committed', 'released', 'redeemed'],
      }),
    },
    indexes: [],
  },
);
