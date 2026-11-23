import { describe, expect, it } from '@effect/vitest';
import type { ISystemServiceCommandInput } from '@zerospin/core/utils/getSystemApi/prepareSystemServiceCommand';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as TestClock from 'effect/testing/TestClock';

import { userAggregateReleaseV1 } from '../src/zerospin/aggregates/user/userAggregateReleaseV1.ts';
import { marketplaceServiceReleaseV1 } from '../src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts';
import { promotionServiceReleaseV1 } from '../src/zerospin/services/promotion/promotionServiceReleaseV1.ts';
import { ShoppingProviders } from '../src/zerospin/ShoppingProviders.ts';
import { ShoppingProvidersLive } from '../src/zerospin/ShoppingProvidersLive.ts';
import { ShoppingSystemApi } from '../src/zerospin/ShoppingSystemApi.ts';
import { system } from '../src/zerospin/system.ts';

describe('Promotion checkout', () => {
  it.effect(
    'releases a declined reservation without affecting a later checkout',
    () =>
      Effect.gen(function* () {
        const paymentKeys: string[] = [];
        const harness = yield* makeSystemHarness({
          system,
          layer: api =>
            Layer.mergeAll(
              Layer.effect(
                ShoppingProviders,
                Effect.map(ShoppingProviders, providers => ({
                  ...providers,
                  pay: ({
                    key,
                    total,
                  }: Parameters<typeof providers.pay>[0]) => {
                    paymentKeys.push(key);
                    expect(total).toBe(1001);
                    return Effect.succeed({
                      key,
                      total,
                      state:
                        key === 'shopping:user_one:pur_one:payment'
                          ? ('declined' as const)
                          : ('paid' as const),
                      reference: `payment:${key}`,
                      evidence: 'Example payment decision',
                    });
                  },
                })),
              ).pipe(Layer.provide(ShoppingProvidersLive)),
              Layer.succeed(ShoppingSystemApi, Effect.succeed(api)),
            ),
        });
        const userDb = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });
        const promotionDb = sdk.makeQueryDbVersion({
          models: promotionServiceReleaseV1.models,
        });

        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_1',
          contractVersion:
            marketplaceServiceReleaseV1.contracts.createProduct.version,
          serviceName: marketplaceServiceReleaseV1.name,
          serviceVersion: marketplaceServiceReleaseV1.version,
          kind: 'actor',
          actorName: 'catalog',
          actorVersion: 1,
          claims: { clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_1',
          sessionName: 'catalogSession',
          pushIndex: 1,

          commandName: 'createProduct',
          payload: {
            id: 'prd_one',
            name: 'T-shirt',
            description: 'A cotton T-shirt',
            price: 2001,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_2',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_2',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_one',
            newCartItemId: 'cit_one',
            product: { id: 'prd_one', name: 'T-shirt', price: 2001 },
            quantity: 1,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_3',
          contractVersion:
            userAggregateReleaseV1.contracts.applyPromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_3',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'applyPromotion',
          payload: { cartId: 'crt_one', reservationId: 'prv_one' },
        } as const);
        yield* harness.flush();
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_4',
          contractVersion: userAggregateReleaseV1.contracts.checkout.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_4',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'checkout',
          payload: {
            cartId: 'crt_one',
            purchaseId: 'pur_one',
            reservationId: 'prv_one',
          },
        } as const);
        yield* harness.flush();

        const declined = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.purchase.findFirst({ where: { id: { eq: 'pur_one' } } }),
        );
        const retainedItems = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.cartItem.findMany({}),
        );
        const released = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_one' } },
          }),
        );
        expect(declined).toMatchObject({
          paymentState: 'declined',
          subtotal: 2001,
          discount: 1000,
          total: 1001,
        });
        expect(retainedItems).toMatchObject([{ id: 'cit_one', quantity: 1 }]);
        expect(released).toMatchObject({
          status: 'released',
          purchaseId: 'pur_one',
        });

        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_5',
          contractVersion:
            userAggregateReleaseV1.contracts.applyPromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_5',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'applyPromotion',
          payload: { cartId: 'crt_one', reservationId: 'prv_two' },
        } as const);
        yield* harness.flush();
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_6',
          contractVersion: userAggregateReleaseV1.contracts.checkout.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_6',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'checkout',
          payload: {
            cartId: 'crt_one',
            purchaseId: 'pur_two',
            reservationId: 'prv_two',
          },
        } as const);
        yield* harness.flush();
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_7',
          contractVersion:
            promotionServiceReleaseV1.contracts.releasePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'releasePromotion',
          payload: {
            id: 'prv_one',
            aggregateId: 'user_one',
            cartId: 'crt_one',
            purchaseId: 'pur_one',
          },
        } as const);

        const paid = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.purchase.findFirst({ where: { id: { eq: 'pur_two' } } }),
        );
        const redeemed = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_two' } },
          }),
        );
        const cart = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.cart.findFirst({ where: { id: { eq: 'crt_one' } } }),
        );
        expect(paid).toMatchObject({
          paymentState: 'paid',
          reservationId: 'prv_two',
          total: 1001,
        });
        expect(redeemed).toMatchObject({
          status: 'redeemed',
          purchaseId: 'pur_two',
        });
        expect(cart?.promotion).toBeNull();
        expect(paymentKeys).toEqual([
          'shopping:user_one:pur_one:payment',
          'shopping:user_one:pur_two:payment',
        ]);
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect(
    'keeps the committed allocation and cart locked while payment is uncertain',
    () =>
      Effect.gen(function* () {
        const harness = yield* makeSystemHarness({
          system,
          layer: api =>
            Layer.mergeAll(
              Layer.effect(
                ShoppingProviders,
                Effect.map(ShoppingProviders, providers => ({
                  ...providers,
                  pay: () =>
                    Effect.fail(
                      sdk.makeZerospinError({
                        code: 'payment-provider-unavailable',
                        message: 'Payment outcome unavailable.',
                      }),
                    ),
                })),
              ).pipe(Layer.provide(ShoppingProvidersLive)),
              Layer.succeed(ShoppingSystemApi, Effect.succeed(api)),
            ),
        });
        const userDb = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });
        const promotionDb = sdk.makeQueryDbVersion({
          models: promotionServiceReleaseV1.models,
        });

        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_8',
          contractVersion:
            marketplaceServiceReleaseV1.contracts.createProduct.version,
          serviceName: marketplaceServiceReleaseV1.name,
          serviceVersion: marketplaceServiceReleaseV1.version,
          kind: 'actor',
          actorName: 'catalog',
          actorVersion: 1,
          claims: { clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_8',
          sessionName: 'catalogSession',
          pushIndex: 1,

          commandName: 'createProduct',
          payload: {
            id: 'prd_one',
            name: 'T-shirt',
            description: 'A cotton T-shirt',
            price: 2000,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_9',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_9',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_one',
            newCartItemId: 'cit_one',
            product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
            quantity: 1,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_10',
          contractVersion:
            userAggregateReleaseV1.contracts.applyPromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_10',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'applyPromotion',
          payload: { cartId: 'crt_one', reservationId: 'prv_one' },
        } as const);
        yield* harness.flush();
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_11',
          contractVersion: userAggregateReleaseV1.contracts.checkout.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_11',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'checkout',
          payload: {
            cartId: 'crt_one',
            purchaseId: 'pur_one',
            reservationId: 'prv_one',
          },
        } as const);
        yield* harness.flush();
        yield* TestClock.adjust('10 minutes');
        yield* harness.flush();

        const removal = {
          id: 'cmd_shopping_promotion_checkout_spec_12',
          contractVersion:
            userAggregateReleaseV1.contracts.removePromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_12',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'removePromotion',
          payload: { cartId: 'crt_one' },
        } as const;
        const removalExit = yield* Effect.exit(harness.push(removal));
        if (!Exit.isFailure(removalExit)) {
          expect.fail(
            'Expected uncertain payment to prevent promotion removal',
          );
        }
        expect(Cause.squash(removalExit.cause)).toMatchObject({
          code: 'promotion-payment-unsettled',
        });

        const wrongRelease = {
          id: 'cmd_shopping_promotion_checkout_spec_13',
          contractVersion:
            promotionServiceReleaseV1.contracts.releasePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'releasePromotion',
          payload: {
            id: 'prv_one',
            aggregateId: 'user_one',
            cartId: 'crt_one',
            purchaseId: 'pur_other',
          },
        } as const;
        const releaseExit = yield* Effect.exit(harness.push(wrongRelease));
        if (!Exit.isFailure(releaseExit)) {
          expect.fail(
            'Expected another Purchase to be unable to release the allocation',
          );
        }
        expect(Cause.squash(releaseExit.cause)).toMatchObject({
          code: 'promotion-conflict',
        });

        const purchase = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.purchase.findFirst({ where: { id: { eq: 'pur_one' } } }),
        );
        const items = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.cartItem.findMany({}),
        );
        const reservation = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_one' } },
          }),
        );
        expect(purchase).toMatchObject({
          paymentState: 'needs_reconciliation',
          paymentReference: null,
        });
        expect(items).toMatchObject([{ id: 'cit_one', quantity: 1 }]);
        expect(reservation).toMatchObject({
          status: 'committed',
          purchaseId: 'pur_one',
        });
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect(
    'refuses a commitment decision for another Purchase without starting payment',
    () =>
      Effect.gen(function* () {
        let paymentCalls = 0;
        const harness = yield* makeSystemHarness({
          system,
          layer: api =>
            Layer.mergeAll(
              Layer.effect(
                ShoppingProviders,
                Effect.map(ShoppingProviders, providers => ({
                  ...providers,
                  pay: (payload: Parameters<typeof providers.pay>[0]) => {
                    paymentCalls += 1;
                    return providers.pay(payload);
                  },
                })),
              ).pipe(Layer.provide(ShoppingProvidersLive)),
              Layer.succeed(
                ShoppingSystemApi,
                Effect.succeed({
                  ...api,
                  executeServiceCommand: <
                    RELEASE extends Parameters<
                      typeof api.executeServiceCommand
                    >[0],
                    NAME extends keyof RELEASE['system'] & string,
                  >(
                    release: RELEASE,
                    input: ISystemServiceCommandInput<RELEASE, NAME>,
                  ) =>
                    api.executeServiceCommand(release, input).pipe(
                      Effect.map(outcome => {
                        if (outcome.result._tag === 'Failure') {
                          expect.fail(
                            'Expected commitment to succeed before replacing its decision',
                          );
                        }
                        expect(outcome.result.success).toMatchObject({
                          reservationId: 'prv_one',
                          status: 'committed',
                          purchaseId: 'pur_one',
                        });
                        // The Service committed this Purchase; its returned decision names another.
                        return {
                          ...outcome,
                          result: {
                            _tag: 'Success' as const,
                            success: {
                              reservationId: 'prv_one',
                              status: 'committed',
                              purchaseId: 'pur_other',
                              expiresAt: 600000,
                            },
                          },
                        };
                      }),
                    ),
                }),
              ),
            ),
        });
        const userDb = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });
        const promotionDb = sdk.makeQueryDbVersion({
          models: promotionServiceReleaseV1.models,
        });

        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_14',
          contractVersion:
            marketplaceServiceReleaseV1.contracts.createProduct.version,
          serviceName: marketplaceServiceReleaseV1.name,
          serviceVersion: marketplaceServiceReleaseV1.version,
          kind: 'actor',
          actorName: 'catalog',
          actorVersion: 1,
          claims: { clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_14',
          sessionName: 'catalogSession',
          pushIndex: 1,

          commandName: 'createProduct',
          payload: {
            id: 'prd_one',
            name: 'T-shirt',
            description: 'A cotton T-shirt',
            price: 2000,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_15',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_15',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_one',
            newCartItemId: 'cit_one',
            product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
            quantity: 1,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_16',
          contractVersion:
            userAggregateReleaseV1.contracts.applyPromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_16',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'applyPromotion',
          payload: { cartId: 'crt_one', reservationId: 'prv_one' },
        } as const);
        yield* harness.flush();
        yield* harness.push({
          id: 'cmd_shopping_promotion_checkout_spec_17',
          contractVersion: userAggregateReleaseV1.contracts.checkout.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_checkout_spec_17',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'checkout',
          payload: {
            cartId: 'crt_one',
            purchaseId: 'pur_one',
            reservationId: 'prv_one',
          },
        } as const);
        yield* harness.flush();

        const purchase = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.purchase.findFirst({ where: { id: { eq: 'pur_one' } } }),
        );
        const reservation = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_one' } },
          }),
        );
        expect(purchase).toMatchObject({
          paymentState: 'refused',
          paymentReference: null,
          reservationId: 'prv_one',
          subtotal: 2000,
        });
        expect(reservation).toMatchObject({
          status: 'released',
          purchaseId: 'pur_one',
        });
        expect(paymentCalls).toBe(0);
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );
});
