import * as sdk from '@zerospin/sdk/browser';
import * as Schema from 'effect/Schema';

import { purchase } from '../purchase/purchase';

import { cart } from './cart';

export const cartV1 = sdk.makeModelVersion(cart, {
  version: 1,
  attributes: {
    promotion: sdk.primitives.json({
      nullable: true,
      schema: Schema.Struct({
        reservationId: Schema.TemplateLiteral(['prv_', Schema.String]),
        action: Schema.Literals(['apply', 'remove']),
      }),
    }),
    checkoutPurchaseId: sdk.modelRef({
      nullable: true,
      unique: true,
      model: purchase,
      relation: 'checkoutPurchase',
      inverse: 'checkoutCart',
    }),
  },
  indexes: [],
});
