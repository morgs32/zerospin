import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { clerkCredentialsSchema, userClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { promotionReservationV1 } from '../models/promotionReservation/PromotionReservationV1';

const db = sdk.makeQueryDbVersion({
  models: { promotionReservation: promotionReservationV1 },
});
const identity = sdk.makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse('/:clerkUserId'),
});

export const shopperActorV1 = sdk.makeServiceActorRelease(
  sdk.defineServiceActor({ name: 'shopper' }),
  {
    version: 1,
    db,
    exposedModels: db.models,
    identity,
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({ clerkUserId })),
        ),
    },
    contracts: {},
    selections: {
      promotionReservation: db.query.promotionReservation.findMany({
        where: { aggregateId: { eq: identity.sql.placeholder('clerkUserId') } },
      }),
    },
  },
);
