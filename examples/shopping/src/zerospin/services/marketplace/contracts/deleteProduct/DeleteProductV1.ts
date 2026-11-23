import * as sdk from '@zerospin/sdk/browser';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { deleteProduct } from './deleteProduct';

export const deleteProductV1 = sdk.makeServiceContractRelease(deleteProduct, {
  payload: {
    id: sdk.modelId({ model: product }),
  },

  models: {
    product: {
      model: productV1,
      fields: ['name', 'createdAt', 'updatedAt', 'price', 'description'],
    },
  },
  operations: { deleteProduct: productV1.operations.delete },
  program: ({ payload, operations }) => {
    const { id } = payload;
    return operations.deleteProduct({ resourceId: id });
  },
  version: 1,
});
