import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { receiveCommandV1 } from '../contracts/receiveCommandV1.ts';

const accountQueries = makeQueryDbVersion({ models: {} });

export const viewerV1 = makeAggregateActorRelease(
  { name: 'viewer' },
  {
    version: 1,
    db: accountQueries,
    exposedModels: {},
    identity: makeActorIdentity({
      claims: Schema.Struct({
        aggregateId: Schema.String,
        viewerId: Schema.String,
      }),
      actorPath: RoutePattern.parse('/:viewerId'),
    }),
    authentication: {
      credentialsSchema: Schema.Struct({ viewerId: Schema.String }),
      authenticate: ({ aggregateId, credentials }) =>
        Effect.succeed({ aggregateId, ...credentials }),
    },
    selections: {},
    contracts: { receiveCommand: receiveCommandV1 },
  },
);
