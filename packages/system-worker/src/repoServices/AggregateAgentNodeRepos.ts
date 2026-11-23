import * as Context from 'effect/Context';

import type { getAggregateAgentNodeRepo } from '../AggregateAgentNodeRepo/getAggregateAgentNodeRepo.js';

/** Acquire the durable executor for one registered Aggregate Agent definition. */
export class AggregateAgentNodeRepos extends Context.Service<
  AggregateAgentNodeRepos,
  { getRepo: typeof getAggregateAgentNodeRepo }
>()('AggregateAgentNodeRepos') {}
