import * as Layer from 'effect/Layer';

import { aggregateChainNameUtils } from '../AggregateChain/aggregateChainName.js';
import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';
import {
  getAggregateActorVersionChain,
  getAggregateAgentVersionChain,
  getAggregateVersionChain,
} from '../ownerOperations/releaseRepoNamespaces.js';

import { AggregateActorVersionChains } from './AggregateActorVersionChains.js';
import { AggregateAgentVersionChains } from './AggregateAgentVersionChains.js';
import { AggregateChains } from './AggregateChains.js';
import { AggregateVersionChains } from './AggregateVersionChains.js';

export const AggregateProjectionReposLive = Layer.mergeAll(
  Layer.succeed(AggregateChains, {
    getRepo: bindRepoNamespace(aggregateChainNameUtils, 'AGGREGATE_CHAIN'),
  }),
  Layer.succeed(AggregateActorVersionChains, {
    getRepo: getAggregateActorVersionChain,
  }),
  Layer.succeed(AggregateAgentVersionChains, {
    getRepo: getAggregateAgentVersionChain,
  }),
  Layer.succeed(AggregateVersionChains, {
    getRepo: getAggregateVersionChain,
  }),
);
