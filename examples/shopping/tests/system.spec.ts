import { describe, expect, it } from '@effect/vitest';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as TestClock from 'effect/testing/TestClock';

import { userAggregateReleaseV1 } from '../src/zerospin/aggregates/user/userAggregateReleaseV1.ts';
import { seeds } from '../src/zerospin/seeds.ts';
import { marketplaceServiceReleaseV1 } from '../src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts';
import { promotionServiceReleaseV1 } from '../src/zerospin/services/promotion/promotionServiceReleaseV1.ts';
import { ShoppingProvidersLive } from '../src/zerospin/ShoppingProvidersLive.ts';
import { ShoppingSystemApi } from '../src/zerospin/ShoppingSystemApi.ts';
import { system } from '../src/zerospin/system.ts';

describe('Shopping cart', () => {
  it.effect(
    'merges a Product into one line and sets its quantity absolutely',
    () =>
      Effect.gen(function* () {
        const harness = yield* makeSystemHarness({ system });
        const db = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });
        expect(userAggregateReleaseV1.models.cartItem.indexes).toEqual([
          {
            name: 'cartItem_cartId_productId_unique',
            columns: ['cartId', 'productId'],
            unique: true,
          },
        ]);

        yield* harness.push({
          id: 'cmd_shopping_system_spec_1',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_system_spec_1',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_one',
            newCartItemId: 'cit_one',
            product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
            quantity: 2,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_system_spec_2',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_system_spec_2',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_other',
            newCartItemId: 'cit_other',
            product: { id: 'prd_one', name: 'New preview', price: 3000 },
            quantity: 3,
          },
        } as const);

        const merged = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          db.query.cartItem.findMany({}),
        );
        expect(merged).toMatchObject([
          {
            id: 'cit_one',
            cartId: 'crt_one',
            productId: 'prd_one',
            name: 'T-shirt',
            price: 2000,
            quantity: 5,
          },
        ]);

        yield* harness.push({
          id: 'cmd_shopping_system_spec_3',
          contractVersion:
            userAggregateReleaseV1.contracts.updateCartItemQuantity.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_system_spec_3',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'updateCartItemQuantity',
          payload: { cartItemId: 'cit_one', quantity: 4 },
        } as const);

        const updated = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          db.query.cartItem.findMany({}),
        );
        expect(updated).toMatchObject([{ id: 'cit_one', quantity: 4 }]);
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect('refuses an overflowing addition without changing the line', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const db = sdk.makeQueryDbVersion({
        models: userAggregateReleaseV1.models,
      });

      yield* harness.push({
        id: 'cmd_shopping_system_spec_4',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_4',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'addToCart',
        payload: {
          newCartId: 'crt_one',
          newCartItemId: 'cit_one',
          product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
          quantity: Number.MAX_SAFE_INTEGER,
        },
      } as const);
      const command = {
        id: 'cmd_shopping_system_spec_5',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_5',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'addToCart',
        payload: {
          newCartId: 'crt_other',
          newCartItemId: 'cit_other',
          product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
          quantity: 1,
        },
      } as const;
      const exit = yield* Effect.exit(harness.push(command));

      if (!Exit.isFailure(exit)) {
        expect.fail('Expected an overflowing quantity to reject');
      }
      expect(Cause.squash(exit.cause)).toMatchObject({
        code: 'cart-quantity-invalid',
      });
      const items = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        db.query.cartItem.findMany({}),
      );
      expect(items).toMatchObject([
        { id: 'cit_one', quantity: Number.MAX_SAFE_INTEGER },
      ]);
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect('lets a removed Product return with a new line ID', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const db = sdk.makeQueryDbVersion({
        models: userAggregateReleaseV1.models,
      });

      yield* harness.push({
        id: 'cmd_shopping_system_spec_6',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_6',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'addToCart',
        payload: {
          newCartId: 'crt_one',
          newCartItemId: 'cit_one',
          product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
          quantity: 2,
        },
      } as const);
      yield* harness.push({
        id: 'cmd_shopping_system_spec_7',
        contractVersion:
          userAggregateReleaseV1.contracts.removeFromCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_7',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'removeFromCart',
        payload: { id: 'cit_one' },
      } as const);

      const removed = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        db.query.cartItem.findMany({}),
      );
      expect(removed).toEqual([]);

      yield* harness.push({
        id: 'cmd_shopping_system_spec_8',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_8',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'addToCart',
        payload: {
          newCartId: 'crt_other',
          newCartItemId: 'cit_two',
          product: { id: 'prd_one', name: 'T-shirt', price: 2000 },
          quantity: 3,
        },
      } as const);

      const items = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        db.query.cartItem.findMany({}),
      );
      expect(items).toMatchObject([
        { id: 'cit_two', cartId: 'crt_one', productId: 'prd_one', quantity: 3 },
      ]);
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );
});

describe('Shopping checkout', () => {
  for (const price of [2000, 0]) {
    it.effect(
      `pays a ${price} Purchase and redeems its Promotion reservation`,
      () =>
        Effect.gen(function* () {
          const harness = yield* makeSystemHarness({
            system,
            layer: api =>
              Layer.mergeAll(
                ShoppingProvidersLive,
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
            id: 'cmd_shopping_system_spec_9',
            contractVersion:
              marketplaceServiceReleaseV1.contracts.createProduct.version,
            serviceName: marketplaceServiceReleaseV1.name,
            serviceVersion: marketplaceServiceReleaseV1.version,
            kind: 'actor',
            actorName: 'catalog',
            actorVersion: 1,
            claims: { clerkUserId: 'user_one' },
            nodeId: 'node_shopping_system_spec_9',
            sessionName: 'catalogSession',
            pushIndex: 1,

            commandName: 'createProduct',
            payload: {
              id: 'prd_one',
              name: 'T-shirt',
              description: 'A cotton T-shirt',
              price,
            },
          } as const);
          yield* harness.push({
            id: 'cmd_shopping_system_spec_10',
            contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
            aggregateName: userAggregateReleaseV1.name,
            aggregateVersion: userAggregateReleaseV1.version,
            kind: 'actor',
            actorName: 'user',
            actorVersion: 1,
            claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
            nodeId: 'node_shopping_system_spec_10',
            sessionName: 'shopperSession',
            pushIndex: 1,

            aggregateId: 'user_one',
            commandName: 'addToCart',
            payload: {
              newCartId: 'crt_one',
              newCartItemId: 'cit_one',
              product: {
                id: 'prd_one',
                name: 'Untrusted preview',
                price: price + 123,
              },
              quantity: 1,
            },
          } as const);
          yield* harness.push({
            id: 'cmd_shopping_system_spec_11',
            contractVersion:
              userAggregateReleaseV1.contracts.applyPromotion.version,
            aggregateName: userAggregateReleaseV1.name,
            aggregateVersion: userAggregateReleaseV1.version,
            kind: 'actor',
            actorName: 'user',
            actorVersion: 1,
            claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
            nodeId: 'node_shopping_system_spec_11',
            sessionName: 'shopperSession',
            pushIndex: 1,

            aggregateId: 'user_one',
            commandName: 'applyPromotion',
            payload: { cartId: 'crt_one', reservationId: 'prv_one' },
          } as const);
          yield* harness.flush();

          const reservationSelection =
            promotionDb.query.promotionReservation.findFirst({
              where: { id: { eq: 'prv_one' } },
            });
          const reserved = yield* harness.query(
            { release: promotionServiceReleaseV1 },
            reservationSelection,
          );
          expect(reserved?.status).toBe('reserved');

          yield* harness.push({
            id: 'cmd_shopping_system_spec_12',
            contractVersion: userAggregateReleaseV1.contracts.checkout.version,
            aggregateName: userAggregateReleaseV1.name,
            aggregateVersion: userAggregateReleaseV1.version,
            kind: 'actor',
            actorName: 'user',
            actorVersion: 1,
            claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
            nodeId: 'node_shopping_system_spec_12',
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
          const edit = {
            id: 'cmd_shopping_system_spec_13',
            contractVersion:
              userAggregateReleaseV1.contracts.updateCartItemQuantity.version,
            aggregateName: userAggregateReleaseV1.name,
            aggregateVersion: userAggregateReleaseV1.version,
            kind: 'actor',
            actorName: 'user',
            actorVersion: 1,
            claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
            nodeId: 'node_shopping_system_spec_13',
            sessionName: 'shopperSession',
            pushIndex: 1,

            aggregateId: 'user_one',
            commandName: 'updateCartItemQuantity',
            payload: { cartItemId: 'cit_one', quantity: 2 },
          } as const;
          const editExit = yield* Effect.exit(harness.push(edit));
          if (!Exit.isFailure(editExit)) {
            expect.fail('Expected checkout to lock cart quantity changes');
          }
          expect(Cause.squash(editExit.cause)).toMatchObject({
            code: 'cart-checkout-in-progress',
          });
          yield* harness.flush();

          const purchase = yield* harness.query(
            { release: userAggregateReleaseV1, aggregateId: 'user_one' },
            userDb.query.purchase.findFirst({
              where: { id: { eq: 'pur_one' } },
            }),
          );
          const reservation = yield* harness.query(
            { release: promotionServiceReleaseV1 },
            reservationSelection,
          );
          const purchaseItems = yield* harness.query(
            { release: userAggregateReleaseV1, aggregateId: 'user_one' },
            userDb.query.purchaseItem.findMany({
              where: { purchaseId: { eq: 'pur_one' } },
            }),
          );
          const cartItems = yield* harness.query(
            { release: userAggregateReleaseV1, aggregateId: 'user_one' },
            userDb.query.cartItem.findMany({}),
          );
          expect(purchase).toMatchObject({
            paymentState: 'paid',
            reservationId: 'prv_one',
            subtotal: price,
            total: price / 2,
          });
          expect(reservation).toMatchObject({
            status: 'redeemed',
            purchaseId: 'pur_one',
          });
          expect(purchaseItems).toMatchObject([
            { productId: 'prd_one', quantity: 1 },
          ]);
          expect(cartItems).toEqual([]);
        }).pipe(Effect.provide(sdk.NanoIdFactory)),
    );
  }

  it.effect('releases an expired reservation and refuses checkout', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({
        system,
        layer: api =>
          Layer.mergeAll(
            ShoppingProvidersLive,
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
        id: 'cmd_shopping_system_spec_14',
        contractVersion:
          marketplaceServiceReleaseV1.contracts.createProduct.version,
        serviceName: marketplaceServiceReleaseV1.name,
        serviceVersion: marketplaceServiceReleaseV1.version,
        kind: 'actor',
        actorName: 'catalog',
        actorVersion: 1,
        claims: { clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_14',
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
        id: 'cmd_shopping_system_spec_15',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_15',
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
        id: 'cmd_shopping_system_spec_16',
        contractVersion:
          userAggregateReleaseV1.contracts.applyPromotion.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_16',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'applyPromotion',
        payload: { cartId: 'crt_one', reservationId: 'prv_one' },
      } as const);
      yield* harness.flush();

      const reservationSelection =
        promotionDb.query.promotionReservation.findFirst({
          where: { id: { eq: 'prv_one' } },
        });
      const reserved = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        reservationSelection,
      );
      expect(reserved?.status).toBe('reserved');

      yield* TestClock.adjust('599999 millis');
      yield* harness.flush();
      const beforeExpiry = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        reservationSelection,
      );
      expect(beforeExpiry).toMatchObject({
        status: 'reserved',
        expiresAt: reserved?.expiresAt,
      });

      yield* TestClock.adjust('1 millis');
      yield* harness.flush();
      const released = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        reservationSelection,
      );
      expect(released?.status).toBe('released');

      yield* harness.push({
        id: 'cmd_shopping_system_spec_17',
        contractVersion: userAggregateReleaseV1.contracts.checkout.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_17',
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
        userDb.query.purchase.findFirst({
          where: { id: { eq: 'pur_one' } },
        }),
      );
      const reservation = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        reservationSelection,
      );
      expect(purchase).toMatchObject({
        paymentState: 'refused',
        paymentReference: null,
        reservationId: 'prv_one',
        subtotal: 2000,
      });
      expect(reservation?.status).toBe('released');
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect('keeps a promotion reusable after refusing an unsafe quote', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({
        system,
        layer: api =>
          Layer.mergeAll(
            ShoppingProvidersLive,
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
        id: 'cmd_shopping_system_spec_18',
        contractVersion:
          marketplaceServiceReleaseV1.contracts.createProduct.version,
        serviceName: marketplaceServiceReleaseV1.name,
        serviceVersion: marketplaceServiceReleaseV1.version,
        kind: 'actor',
        actorName: 'catalog',
        actorVersion: 1,
        claims: { clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_18',
        sessionName: 'catalogSession',
        pushIndex: 1,

        commandName: 'createProduct',
        payload: {
          id: 'prd_one',
          name: 'Sample',
          description: 'A sample',
          price: 2,
        },
      } as const);
      yield* harness.push({
        id: 'cmd_shopping_system_spec_19',
        contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_19',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'addToCart',
        payload: {
          newCartId: 'crt_one',
          newCartItemId: 'cit_one',
          product: { id: 'prd_one', name: 'Sample', price: 2 },
          quantity: Number.MAX_SAFE_INTEGER,
        },
      } as const);
      yield* harness.push({
        id: 'cmd_shopping_system_spec_20',
        contractVersion:
          userAggregateReleaseV1.contracts.applyPromotion.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_20',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'applyPromotion',
        payload: { cartId: 'crt_one', reservationId: 'prv_one' },
      } as const);
      yield* harness.flush();

      const staleSelection = {
        id: 'cmd_shopping_system_spec_21',
        contractVersion: userAggregateReleaseV1.contracts.checkout.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_21',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'checkout',
        payload: {
          cartId: 'crt_one',
          purchaseId: 'pur_stale',
          reservationId: null,
        },
      } as const;
      const selectionExit = yield* Effect.exit(harness.push(staleSelection));
      if (!Exit.isFailure(selectionExit)) {
        expect.fail(
          'Expected checkout with an outdated promotion selection to reject',
        );
      }
      expect(Cause.squash(selectionExit.cause)).toMatchObject({
        code: 'checkout-promotion-selection-changed',
      });
      const beforeCheckout = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        userDb.query.purchase.findMany({}),
      );
      expect(beforeCheckout).toEqual([]);

      yield* harness.push({
        id: 'cmd_shopping_system_spec_22',
        contractVersion: userAggregateReleaseV1.contracts.checkout.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_22',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'checkout',
        payload: {
          cartId: 'crt_one',
          purchaseId: 'pur_unsafe',
          reservationId: 'prv_one',
        },
      } as const);
      yield* harness.flush();
      const refused = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        userDb.query.purchase.findFirst({
          where: { id: { eq: 'pur_unsafe' } },
        }),
      );
      const reserved = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        promotionDb.query.promotionReservation.findFirst({
          where: { id: { eq: 'prv_one' } },
        }),
      );
      expect(refused).toMatchObject({
        paymentState: 'refused',
        paymentReference: null,
        reservationId: 'prv_one',
        subtotal: null,
      });
      expect(reserved).toMatchObject({ status: 'reserved', purchaseId: null });

      yield* harness.push({
        id: 'cmd_shopping_system_spec_23',
        contractVersion:
          userAggregateReleaseV1.contracts.updateCartItemQuantity.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_23',
        sessionName: 'shopperSession',
        pushIndex: 1,

        aggregateId: 'user_one',
        commandName: 'updateCartItemQuantity',
        payload: { cartItemId: 'cit_one', quantity: 1 },
      } as const);
      yield* harness.push({
        id: 'cmd_shopping_system_spec_24',
        contractVersion: userAggregateReleaseV1.contracts.checkout.version,
        aggregateName: userAggregateReleaseV1.name,
        aggregateVersion: userAggregateReleaseV1.version,
        kind: 'actor',
        actorName: 'user',
        actorVersion: 1,
        claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_24',
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
      const paid = yield* harness.query(
        { release: userAggregateReleaseV1, aggregateId: 'user_one' },
        userDb.query.purchase.findFirst({ where: { id: { eq: 'pur_one' } } }),
      );
      const redeemed = yield* harness.query(
        { release: promotionServiceReleaseV1 },
        promotionDb.query.promotionReservation.findFirst({
          where: { id: { eq: 'prv_one' } },
        }),
      );
      expect(paid).toMatchObject({
        paymentState: 'paid',
        subtotal: 2,
        discount: 1,
        total: 1,
      });
      expect(redeemed).toMatchObject({
        status: 'redeemed',
        purchaseId: 'pur_one',
      });
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect(
    'refuses checkout when its Product is unavailable in Marketplace',
    () =>
      Effect.gen(function* () {
        const harness = yield* makeSystemHarness({
          system,
          layer: api =>
            Layer.mergeAll(
              ShoppingProvidersLive,
              Layer.succeed(ShoppingSystemApi, Effect.succeed(api)),
            ),
        });
        const db = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });

        yield* harness.push({
          id: 'cmd_shopping_system_spec_25',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_system_spec_25',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'addToCart',
          payload: {
            newCartId: 'crt_one',
            newCartItemId: 'cit_one',
            product: { id: 'prd_missing', name: 'T-shirt', price: 2000 },
            quantity: 1,
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_system_spec_26',
          contractVersion: userAggregateReleaseV1.contracts.checkout.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_system_spec_26',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'checkout',
          payload: {
            cartId: 'crt_one',
            purchaseId: 'pur_one',
            reservationId: null,
          },
        } as const);
        yield* harness.flush();

        const purchase = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          db.query.purchase.findFirst({ where: { id: { eq: 'pur_one' } } }),
        );

        expect(purchase?.paymentState).toBe('refused');
        expect(purchase?.paymentReference).toBeNull();
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );
});

describe('Shopping Product creation', () => {
  it.effect('creates a zero-price Product', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const db = sdk.makeQueryDbVersion({
        models: marketplaceServiceReleaseV1.models,
      });

      yield* harness.push({
        id: 'cmd_shopping_system_spec_27',
        contractVersion:
          marketplaceServiceReleaseV1.contracts.createProduct.version,
        serviceName: marketplaceServiceReleaseV1.name,
        serviceVersion: marketplaceServiceReleaseV1.version,
        kind: 'actor',
        actorName: 'catalog',
        actorVersion: 1,
        claims: { clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_27',
        sessionName: 'catalogSession',
        pushIndex: 1,

        commandName: 'createProduct',
        payload: {
          id: 'prd_free',
          name: 'Free sample',
          description: 'A complimentary sample',
          price: 0,
        },
      } as const);

      const product = yield* harness.query(
        { release: marketplaceServiceReleaseV1 },
        db.query.product.findFirst({ where: { id: { eq: 'prd_free' } } }),
      );
      expect(product).toMatchObject({ id: 'prd_free', price: 0 });
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect('rejects a negative price without creating a Product', () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const db = sdk.makeQueryDbVersion({
        models: marketplaceServiceReleaseV1.models,
      });
      const command = {
        id: 'cmd_shopping_system_spec_28',
        contractVersion:
          marketplaceServiceReleaseV1.contracts.createProduct.version,
        serviceName: marketplaceServiceReleaseV1.name,
        serviceVersion: marketplaceServiceReleaseV1.version,
        kind: 'actor',
        actorName: 'catalog',
        actorVersion: 1,
        claims: { clerkUserId: 'user_one' },
        nodeId: 'node_shopping_system_spec_28',
        sessionName: 'catalogSession',
        pushIndex: 1,

        commandName: 'createProduct',
        payload: {
          id: 'prd_one',
          name: 'T-shirt',
          description: 'A cotton T-shirt',
          price: -1,
        },
      } as const;
      const exit = yield* Effect.exit(harness.push(command));
      const products = yield* harness.query(
        { release: marketplaceServiceReleaseV1 },
        db.query.product.findMany({}),
      );

      if (!Exit.isFailure(exit)) {
        expect.fail('Expected a negative Product price to reject');
      }
      expect(Cause.squash(exit.cause)).toMatchObject({
        code: 'product-price-invalid',
      });
      expect(products).toEqual([]);
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );
});

it.effect(
  'stops actual create-only seeds on an existing Product while retaining earlier successes',
  () =>
    Effect.gen(function* () {
      let runSeeds: Effect.Effect<void, unknown> = Effect.die(
        'Seed API was not bound',
      );
      const harness = yield* makeSystemHarness({
        system,
        layer: api => {
          // The seed program uses only the harness's supported Service administrative methods.
          runSeeds = Reflect.apply(seeds, undefined, [api]);
          return Layer.empty;
        },
      });
      yield* harness.push({
        id: 'cmd_existing_seed_product',
        kind: 'system',
        serviceName: marketplaceServiceReleaseV1.name,
        serviceVersion: 1,
        commandName: 'createProduct',
        contractVersion: 1,
        payload: {
          id: 'prd_seed-3',
          name: 'Existing',
          description: 'Keep existing data',
          price: 9000,
        },
      });
      expect(Exit.isFailure(yield* Effect.exit(runSeeds))).toBe(true);
      const db = sdk.makeQueryDbVersion({
        models: marketplaceServiceReleaseV1.models,
      });
      const rows = yield* harness.query(
        { release: marketplaceServiceReleaseV1 },
        db.query.product.findMany({}),
      );
      expect(rows.map(row => row.id).sort()).toEqual([
        'prd_seed-1',
        'prd_seed-2',
        'prd_seed-3',
      ]);
      expect(rows.find(row => row.id === 'prd_seed-3')?.name).toBe('Existing');
      // A rerun stops immediately on its first existing create; no upsert or recovery occurs.
      expect(Exit.isFailure(yield* Effect.exit(runSeeds))).toBe(true);
      expect(
        yield* harness.query(
          { release: marketplaceServiceReleaseV1 },
          db.query.product.findMany({}),
        ),
      ).toEqual(rows);
    }).pipe(Effect.provide(sdk.NanoIdFactory)),
);
