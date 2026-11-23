import type { IProjectedReadModels } from '@zerospin/core/contracts/readProjection';
import type {
  IContractCallbackInput,
  IContractProgramInput,
} from '@zerospin/core/contracts/types';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { cartItem } from '../models/cartItem/cartItem';
import { cartItemV1 } from '../models/cartItem/CartItemV1';

import { addToCartV1 } from './addToCartV1';

const payload = {
  cartId: sdk.modelId({ model: cart }),
  cartItemId: sdk.modelId({ model: cartItem }),
  product: addToCartV1.payload.product,
};
const models = {
  cart: { model: cartV1, fields: [] },
  cartItem: { model: cartItemV1, fields: ['quantity'] },
} as const;
const operations = {
  createCart: cartV1.operations.create,
  createCartItem: cartItemV1.operations.create,
  updateCartItem: cartItemV1.operations.update,
};

type IReleaseCartItemInput = Pick<
  IContractProgramInput<
    IContractCallbackInput<typeof payload, IProjectedReadModels<typeof models>>,
    typeof operations
  >,
  'db' | 'payload' | 'operations'
>;

export const recordReleaseCartItem = Effect.fn('recordReleaseCartItem')(
  function* (input: IReleaseCartItemInput, quantity: number) {
    const {
      db,
      operations,
      payload: { cartId, cartItemId, product },
    } = input;
    const item = yield* sdk.findFirst({
      db,
      model: db.models.cartItem,
      where: { id: { eq: cartItemId } },
    });
    if (item !== undefined) {
      yield* operations.updateCartItem({
        resourceId: cartItemId,
        attributes: { quantity: item.quantity + quantity },
      });
      return;
    }
    const cart = yield* sdk.findFirst({
      db,
      model: db.models.cart,
      where: { id: { eq: cartId } },
    });
    if (cart === undefined) {
      yield* operations.createCart({
        resourceId: cartId,
        attributes: { checkoutPurchaseId: null, promotion: null },
      });
    }
    yield* operations.createCartItem({
      resourceId: cartItemId,
      attributes: {
        cartId,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
      },
    });
  },
);

export const addReleaseCartItemV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('addReleaseCartItem'),
  {
    version: 1,
    payload,
    models,
    operations,
    program: input => recordReleaseCartItem(input, 1),
  },
);
