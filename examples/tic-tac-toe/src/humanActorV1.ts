import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import * as Effect from 'effect/Effect';

import { createGame } from './contracts/createGameV1';
import { playX } from './contracts/playXV1';
import { claimsSchema, credentialsSchema, game } from './gameV1';

const db = makeQueryDbVersion({ models: { game } });
const path = RoutePattern.parse('/:aggregateId/:instanceId');
const identity = makeActorIdentity({ claims: claimsSchema, actorPath: path });
export const human = makeAggregateActorRelease(
  { name: 'human' },
  {
    authentication: {
      credentialsSchema,
      authenticate: ({ aggregateId, credentials }) =>
        Effect.succeed({
          aggregateId,
          instanceId: credentials.instanceId,
        }),
    },
    version: 1,
    db,
    exposedModels: db.models,
    identity,
    selections: {
      game: db.query.game.findMany({
        where: { id: { eq: identity.sql.placeholder('instanceId') } },
      }),
    },
    contracts: { createGame, playX },
  },
);
