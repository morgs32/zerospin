import * as sdk from '@zerospin/sdk/browser';

import { product } from '../../../../services/marketplace/models/product/product';
import { cart } from '../cart/cart';

import { cartItem } from './cartItem';

export const cartItemV1 = sdk.makeModelVersion(cartItem, {
  version: 1,
  attributes: {
    cartId: sdk.modelRef({
      nullable: false,
      model: cart,
      relation: 'cart',
      inverse: 'items',
    }),
    productId: sdk.modelId({ model: product }),
    name: sdk.primitives.text(),
    price: sdk.primitives.integer(),
    quantity: sdk.primitives.integer(),
  },
  indexes: [
    {
      name: 'cartItem_cartId_productId_unique',
      columns: ['cartId', 'productId'],
      unique: true,
    },
  ],
});
