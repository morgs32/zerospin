import * as Context from 'effect/Context';

import type { getServiceAgentNodeRepo } from '../ServiceAgentNodeRepo/getServiceAgentNodeRepo.js';

/** Acquire the durable executor for one registered Service Agent definition. */
export class ServiceAgentNodeRepos extends Context.Service<
  ServiceAgentNodeRepos,
  { getRepo: typeof getServiceAgentNodeRepo }
>()('ServiceAgentNodeRepos') {}
