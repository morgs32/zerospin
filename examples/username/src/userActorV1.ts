import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { updateUsernameV1 } from './updateUsernameV1';
import { userId } from './userId';
import { userV1 } from './userV1';

const db = makeQueryDbVersion({ models: { user: userV1 } });

export const userActorV1 = makeAggregateActorRelease(
  defineAggregateActor({ name: 'user' }),
  {
    version: 1,
    db,
    exposedModels: { user: userV1 },
    identity: makeActorIdentity({
      claims: Schema.Struct({ aggregateId: Schema.String }),
      actorPath: RoutePattern.parse('/:aggregateId'),
    }),
    authentication: {
      // Demo credentials give callers access to any aggregate ID they know.
      credentialsSchema: Schema.Struct({}),
      authenticate: ({ aggregateId }) => Effect.succeed({ aggregateId }),
    },
    authorize: Effect.fn('user.authorize')(function* ({ db, executeCommand }) {
      const user = yield* Effect.sync(() =>
        db.query.user.findFirst({ where: { id: { eq: userId } } }).sync(),
      );
      if (user !== undefined) return;

      const outcome = yield* executeCommand({
        commandName: 'createUser',
        contractVersion: 1,
        payload: { id: userId },
      });
      if (
        outcome.result._tag === 'Failure' &&
        outcome.result.failure.code !== 'user-already-exists'
      ) {
        return yield* makeZerospinError({
          code: 'username-user-creation-failed',
          message: outcome.result.failure.message,
        });
      }
    }),
    contracts: { updateUsername: updateUsernameV1 },
    selections: {
      user: db.query.user.findMany({ where: { id: { eq: userId } } }),
    },
  },
);
