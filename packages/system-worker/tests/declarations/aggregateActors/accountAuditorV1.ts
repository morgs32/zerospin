import { makeAggregateActorRelease } from '@zerospin/core/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';

import { viewerV1 as viewer } from './viewerV1.ts';

const accountQueries = makeQueryDbVersion({ models: {} });

export const accountAuditorV1 = makeAggregateActorRelease(
  { name: 'auditor' },
  {
    version: 1,
    db: accountQueries,
    exposedModels: {},
    identity: viewer.identity,
    authentication: viewer.authentication,
    selections: {},
    contracts: {},
  },
);
