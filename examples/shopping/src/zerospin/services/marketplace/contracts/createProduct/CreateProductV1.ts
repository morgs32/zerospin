import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { product } from '../../models/product/product';
import { productV1 } from '../../models/product/ProductV1';

import { createProduct } from './createProduct';

export const createProductV1 = sdk.makeServiceContractRelease(createProduct, {
  payload: {
    id: sdk.modelId({ model: product }),
    description: sdk.primitives.text(),
    name: sdk.primitives.text(),
    price: sdk.primitives.integer(),
  },

  failures: {
    invalidPrice: sdk.ContractError.schema({ code: 'product-price-invalid' }),
  },
  models: {
    product: {
      model: productV1,
      fields: ['name', 'createdAt', 'updatedAt', 'price', 'description'],
    },
  },
  guard: Effect.fn('createProduct.guard')(function* ({ payload, failures }) {
    if (payload.price < 0) {
      return yield* failures.invalidPrice.make({
        message: 'Product price must be zero or greater.',
      });
    }
  }),
  operations: { createProduct: productV1.operations.create },
  program: ({ payload, operations }) => {
    const { description, id, name, price } = payload;
    return operations.createProduct({
      resourceId: id,
      attributes: { description, name, price },
    });
  },
  version: 1,
});
