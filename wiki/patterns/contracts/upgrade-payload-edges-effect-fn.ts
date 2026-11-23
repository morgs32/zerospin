import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import { primitives } from '@zerospin/shapes';
import { Effect } from 'effect';

/**
 * Write `upgradeAggregateContractRelease` payload `up` and `down` as named `Effect.fn`
 * generators. Return the next payload from the generator. Specs, typechecks,
 * and other fixtures use the same shape — do not keep arrow + `Effect.succeed`
 * wrappers in tests.
 *
 * @bad `up: ({ payload }) => Effect.succeed(...)`.
 * @bad `down: ({ payload }) => { ... return Effect.succeed(rest); }`.
 * @bad Spec or typecheck fixture that keeps arrow + `Effect.succeed` edges.
 */

export const addToCartV1 = makeAggregateContractRelease(
  defineAggregateContract('addToCart'),
  {
    version: 1,
    payload: { productId: primitives.text() },
  },
);

export const addToCartV2 = upgradeAggregateContractRelease(addToCartV1, {
  payload: {
    amount: primitives.integer(),
  },
  up: Effect.fn('addToCartV2.up')(function* ({ payload }) {
    return { ...payload, amount: 1 };
  }),
  down: Effect.fn('addToCartV2.down')(function* ({ payload }) {
    const { amount: _amount, ...rest } = payload;
    return rest;
  }),
  version: 2,
});
