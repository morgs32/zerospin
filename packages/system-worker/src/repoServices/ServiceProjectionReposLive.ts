import * as Layer from 'effect/Layer';

import {
  getServiceActorVersionChain,
  getServiceVersionChain,
} from '../ownerOperations/releaseRepoNamespaces.js';

import { ServiceActorVersionChains } from './ServiceActorVersionChains.js';
import { ServiceVersionChains } from './ServiceVersionChains.js';

export const ServiceProjectionReposLive = Layer.mergeAll(
  Layer.succeed(ServiceActorVersionChains, {
    getRepo: getServiceActorVersionChain,
  }),
  Layer.succeed(ServiceVersionChains, {
    getRepo: getServiceVersionChain,
  }),
);
