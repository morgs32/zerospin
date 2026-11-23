import { describe, expect, it } from '@effect/vitest';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as TestClock from 'effect/testing/TestClock';

import { userAggregateReleaseV1 } from '../src/zerospin/aggregates/user/userAggregateReleaseV1.ts';
import { promotionServiceReleaseV1 } from '../src/zerospin/services/promotion/promotionServiceReleaseV1.ts';
import { system } from '../src/zerospin/system.ts';

describe('Shopping promotion reservations', () => {
  it.effect(
    'keeps a cancelled reservation retired when reserve and commit arrive later',
    () =>
      Effect.gen(function* () {
        const harness = yield* makeSystemHarness({ system });
        const userDb = sdk.makeQueryDbVersion({
          models: userAggregateReleaseV1.models,
        });
        const promotionDb = sdk.makeQueryDbVersion({
          models: promotionServiceReleaseV1.models,
        });

        yield* harness.push({
          id: 'cmd_shopping_promotion_spec_1',
          contractVersion: userAggregateReleaseV1.contracts.addToCart.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_spec_1',
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
          id: 'cmd_shopping_promotion_spec_2',
          contractVersion:
            userAggregateReleaseV1.contracts.applyPromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_spec_2',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'applyPromotion',
          payload: { cartId: 'crt_one', reservationId: 'prv_one' },
        } as const);
        const cancellation = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_3',
          contractVersion:
            userAggregateReleaseV1.contracts.removePromotion.version,
          aggregateName: userAggregateReleaseV1.name,
          aggregateVersion: userAggregateReleaseV1.version,
          kind: 'actor',
          actorName: 'user',
          actorVersion: 1,
          claims: { aggregateId: 'user_one', clerkUserId: 'user_one' },
          nodeId: 'node_shopping_promotion_spec_3',
          sessionName: 'shopperSession',
          pushIndex: 1,

          aggregateId: 'user_one',
          commandName: 'removePromotion',
          payload: { cartId: 'crt_one' },
        } as const);
        expect(cancellation).toEqual({
          reservationId: 'prv_one',
          purchaseId: null,
        });
        const beforeDelivery = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_one' } },
          }),
        );
        expect(beforeDelivery).toBeUndefined();

        // Deliver Remove's release before draining Apply's queued reserve.
        const cancelled = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_4',
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
            purchaseId: null,
          },
        } as const);
        expect(cancelled.status).toBe('released');
        yield* harness.flush();

        const delayedCommit = {
          id: 'cmd_shopping_promotion_spec_5',
          contractVersion:
            promotionServiceReleaseV1.contracts.commitPromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'commitPromotion',
          payload: {
            id: 'prv_one',
            aggregateId: 'user_one',
            cartId: 'crt_one',
            purchaseId: 'pur_one',
          },
        } as const;
        const commitExit = yield* Effect.exit(harness.push(delayedCommit));
        if (!Exit.isFailure(commitExit)) {
          expect.fail('Expected commitment after cancellation to reject');
        }
        expect(Cause.squash(commitExit.cause)).toMatchObject({
          code: 'promotion-conflict',
        });

        const reservation = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          promotionDb.query.promotionReservation.findFirst({
            where: { id: { eq: 'prv_one' } },
          }),
        );
        const cart = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.cart.findFirst({ where: { id: { eq: 'crt_one' } } }),
        );
        const purchases = yield* harness.query(
          { release: userAggregateReleaseV1, aggregateId: 'user_one' },
          userDb.query.purchase.findMany({}),
        );
        expect(reservation).toMatchObject({
          status: 'released',
          purchaseId: null,
          expiresAt: null,
        });
        expect(cart?.promotion).toEqual({
          reservationId: 'prv_one',
          action: 'remove',
        });
        expect(purchases).toEqual([]);
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
  );

  it.effect(
    'caps allocations, retires denied IDs and retains lifetime redemptions',
    () =>
      Effect.gen(function* () {
        const harness = yield* makeSystemHarness({ system });
        const db = sdk.makeQueryDbVersion({
          models: promotionServiceReleaseV1.models,
        });
        yield* harness.push({
          id: 'cmd_shopping_promotion_spec_6',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: { id: 'prv_0', aggregateId: 'user_0', cartId: 'crt_0' },
        } as const);
        const duplicateCart = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_7',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: {
            id: 'prv_duplicate',
            aggregateId: 'user_0',
            cartId: 'crt_0',
          },
        } as const);
        expect(duplicateCart.status).toBe('denied');

        for (let index = 1; index < 100; index++) {
          yield* harness.push({
            id: `cmd_shopping_promotion_spec_8_${index}`,
            contractVersion:
              promotionServiceReleaseV1.contracts.reservePromotion.version,
            serviceName: promotionServiceReleaseV1.name,
            serviceVersion: promotionServiceReleaseV1.version,
            kind: 'system',

            commandName: 'reservePromotion',
            payload: {
              id: `prv_${index}`,
              aggregateId: `user_${index}`,
              cartId: `crt_${index}`,
            },
          } as const);
        }
        const holds = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          db.query.promotionReservation.findMany({
            where: { status: { eq: 'reserved' } },
          }),
        );
        expect(holds).toHaveLength(100);

        yield* harness.push({
          id: 'cmd_shopping_promotion_spec_9',
          contractVersion:
            promotionServiceReleaseV1.contracts.commitPromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'commitPromotion',
          payload: {
            id: 'prv_0',
            aggregateId: 'user_0',
            cartId: 'crt_0',
            purchaseId: 'pur_0',
          },
        } as const);
        yield* harness.push({
          id: 'cmd_shopping_promotion_spec_10',
          contractVersion:
            promotionServiceReleaseV1.contracts.redeemPromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'redeemPromotion',
          payload: {
            id: 'prv_0',
            aggregateId: 'user_0',
            cartId: 'crt_0',
            purchaseId: 'pur_0',
          },
        } as const);
        const redeemedAgain = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_11',
          contractVersion:
            promotionServiceReleaseV1.contracts.redeemPromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'redeemPromotion',
          payload: {
            id: 'prv_0',
            aggregateId: 'user_0',
            cartId: 'crt_0',
            purchaseId: 'pur_0',
          },
        } as const);
        expect(redeemedAgain).toMatchObject({
          status: 'redeemed',
          purchaseId: 'pur_0',
        });
        const full = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_12',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: {
            id: 'prv_full',
            aggregateId: 'user_extra',
            cartId: 'crt_extra',
          },
        } as const);
        expect(full.status).toBe('denied');

        yield* harness.push({
          id: 'cmd_shopping_promotion_spec_13',
          contractVersion:
            promotionServiceReleaseV1.contracts.releasePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'releasePromotion',
          payload: {
            id: 'prv_1',
            aggregateId: 'user_1',
            cartId: 'crt_1',
            purchaseId: null,
          },
        } as const);
        const retired = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_14',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: {
            id: 'prv_full',
            aggregateId: 'user_extra',
            cartId: 'crt_extra',
          },
        } as const);
        expect(retired.status).toBe('denied');
        const replacement = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_15',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: {
            id: 'prv_replacement',
            aggregateId: 'user_1',
            cartId: 'crt_1',
          },
        } as const);
        expect(replacement.status).toBe('reserved');

        yield* TestClock.adjust('10 minutes');
        yield* harness.flush();
        const reservations = yield* harness.query(
          { release: promotionServiceReleaseV1 },
          db.query.promotionReservation.findMany({}),
        );
        expect(reservations.filter(row => row.status === 'reserved')).toEqual(
          [],
        );
        expect(
          reservations.filter(row => row.status === 'released'),
        ).toHaveLength(100);
        expect(
          reservations.filter(row => row.status === 'redeemed'),
        ).toMatchObject([{ id: 'prv_0', purchaseId: 'pur_0' }]);
        const afterExpiry = yield* harness.push({
          id: 'cmd_shopping_promotion_spec_16',
          contractVersion:
            promotionServiceReleaseV1.contracts.reservePromotion.version,
          serviceName: promotionServiceReleaseV1.name,
          serviceVersion: promotionServiceReleaseV1.version,
          kind: 'system',

          commandName: 'reservePromotion',
          payload: {
            id: 'prv_after_expiry',
            aggregateId: 'user_after',
            cartId: 'crt_after',
          },
        } as const);
        expect(afterExpiry.status).toBe('reserved');
      }).pipe(Effect.provide(sdk.NanoIdFactory)),
    20000,
  );
});
