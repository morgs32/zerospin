import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { accountAuditorV1 } from '../aggregateActors/accountAuditorV1.ts';
import { viewerV1 } from '../aggregateActors/viewerV1.ts';
import { receiveCommandV1 } from '../contracts/receiveCommandV1.ts';

import { accountAggregate } from './accountAggregate.ts';

export const accountV1 = makeAggregateRelease(accountAggregate, {
  version: 1,
  models: {},
  actors: { viewer: viewerV1, auditor: accountAuditorV1 },
  system: { receiveCommand: receiveCommandV1 },
  external: {},
});
