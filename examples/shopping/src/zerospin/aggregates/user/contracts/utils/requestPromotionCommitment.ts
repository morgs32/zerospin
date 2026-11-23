import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import { commitPromotion } from '../../../../services/promotion/CommitPromotionV1';
import { promotionServiceReleaseV1 } from '../../../../services/promotion/promotionServiceReleaseV1';
import { ShoppingSystemApi } from '../../../../ShoppingSystemApi';

type IPromotionCommitmentRequest = {
  reservationId: `prv_${string}`;
  aggregateId: string;
  cartId: `crt_${string}`;
  purchaseId: `pur_${string}`;
};

/** Bound transport retries for the purchase; every attempt admits a new command. */
export const requestPromotionCommitment = Effect.fn(
  'requestPromotionCommitment',
)(function* (input: IPromotionCommitmentRequest) {
  const acquireApi = yield* ShoppingSystemApi;
  const api = yield* acquireApi;
  const outcome = yield* api
    .executeServiceCommand(promotionServiceReleaseV1, {
      contractName: 'commitPromotion',
      payload: {
        id: input.reservationId,
        aggregateId: input.aggregateId,
        cartId: input.cartId,
        purchaseId: input.purchaseId,
      },
    })
    .pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.spaced('250 millis'),
        while: failure =>
          failure.code === 'rpc-selection-failed' ||
          failure.code === 'rpc-invocation-failed' ||
          failure.code === 'rpc-invalid-response',
      }),
      Effect.mapError(failure =>
        sdk.isZerospinError(failure)
          ? failure
          : sdk.makeZerospinError({
              code: failure.code,
              message: failure.message,
              status: failure.status,
              extra: failure.extra,
            }),
      ),
    );
  if (outcome.result._tag === 'Failure') {
    return yield* sdk.makeZerospinError({
      code: 'shopping-promotion-refused',
      message: outcome.result.failure.message,
    });
  }
  const decision = yield* sdk.resolveContractResult(commitPromotion, {
    commandName: commitPromotion.commandName,
    contractVersion: commitPromotion.version,
    result: outcome.result.success,
  });
  if (decision.reservationId !== input.reservationId) {
    return yield* sdk.makeZerospinError({
      code: 'shopping-promotion-response-mismatch',
      message: 'The promotion decision has a different reservation identity.',
    });
  }
  return decision;
});
