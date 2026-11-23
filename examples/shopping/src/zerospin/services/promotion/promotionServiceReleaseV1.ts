import * as sdk from '@zerospin/sdk';

import { shopperActorV1 } from './actors/shopperActorV1';
import { commitPromotion } from './CommitPromotionV1';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';
import { promotionService } from './promotionService';
import { redeemPromotion } from './RedeemPromotionV1';
import { releasePromotion } from './ReleasePromotionV1';
import { releaseUncommittedReservationV1 } from './ReleaseUncommittedReservationV1';
import { reservePromotion } from './ReservePromotionV1';

export const promotionServiceReleaseV1 = sdk.makeServiceRelease(
  promotionService,
  {
    version: 1,
    contracts: {
      releaseUncommittedReservation: releaseUncommittedReservationV1,
    },
    models: { promotionReservation: promotionReservationV1 },
    actors: { shopper: shopperActorV1 },
    system: {
      reservePromotion,
      commitPromotion,
      releasePromotion,
      redeemPromotion,
    },
  },
);
