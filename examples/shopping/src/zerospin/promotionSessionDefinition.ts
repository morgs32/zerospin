import { makeServiceSessionDefinition } from '@zerospin/browser';

import { userClaims } from './claims';
import { promotionReservationV1 } from './services/promotion/models/promotionReservation/PromotionReservationV1';

export const promotionSessionDefinition = makeServiceSessionDefinition({
  systemName: 'shopping',
  sessionName: 'promotionSession',
  serviceName: 'promotion',
  serviceVersion: 1,
  actorName: 'shopper',
  actorVersion: 1,
  claimsSchema: userClaims,
  models: { promotionReservation: promotionReservationV1 },
  contracts: {},
});
