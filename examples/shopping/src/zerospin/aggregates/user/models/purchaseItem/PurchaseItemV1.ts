import * as sdk from '@zerospin/sdk/browser';

import { product } from '../../../../services/marketplace/models/product/product';
import { purchase } from '../purchase/purchase';

import { purchaseItem } from './purchaseItem';
export const purchaseItemV1 = sdk.makeModelVersion(purchaseItem, {
  version: 1,
  indexes: [],
  attributes: {
    purchaseId: sdk.modelRef({
      nullable: false,
      model: purchase,
      relation: 'purchase',
      inverse: 'items',
    }),
    productId: sdk.modelId({ model: product }),
    name: sdk.primitives.text({ nullable: true }),
    price: sdk.primitives.integer({ nullable: true }),
    quantity: sdk.primitives.integer(),
  },
});
