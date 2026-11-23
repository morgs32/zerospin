import * as Layer from 'effect/Layer';

import { getAggregateAgentNodeRepo } from '../AggregateAgentNodeRepo/getAggregateAgentNodeRepo.js';
import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import { getAggregateVersionRepo } from '../AggregateVersionRepo/getAggregateVersionRepo.js';
import {
  getAggregateActorVersionArchive,
  getAggregateActorVersionChain,
  getAggregateActorVersionRepo,
  getAggregateAgentVersionChain,
  getAggregateAgentVersionRepo,
  getAggregateVersionArchive,
  getAggregateVersionChain,
  getServiceActorVersionArchive,
  getServiceActorVersionChain,
  getServiceActorVersionRepo,
  getServiceAgentVersionChain,
  getServiceAgentVersionRepo,
  getServiceVersionArchive,
  getServiceVersionChain,
} from '../ownerOperations/releaseRepoNamespaces.js';
import { getServiceAgentNodeRepo } from '../ServiceAgentNodeRepo/getServiceAgentNodeRepo.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import { getServiceVersionRepo } from '../ServiceVersionRepo/getServiceVersionRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { AggregateActorVersionArchives } from './AggregateActorVersionArchives.js';
import { AggregateActorVersionChains } from './AggregateActorVersionChains.js';
import { AggregateActorVersionRepos } from './AggregateActorVersionRepos.js';
import { AggregateAgentNodeRepos } from './AggregateAgentNodeRepos.js';
import { AggregateAgentVersionChains } from './AggregateAgentVersionChains.js';
import { AggregateAgentVersionRepos } from './AggregateAgentVersionRepos.js';
import { AggregateChains } from './AggregateChains.js';
import { AggregateVersionArchives } from './AggregateVersionArchives.js';
import { AggregateVersionChains } from './AggregateVersionChains.js';
import { AggregateVersionRepos } from './AggregateVersionRepos.js';
import { ServiceActorVersionArchives } from './ServiceActorVersionArchives.js';
import { ServiceActorVersionChains } from './ServiceActorVersionChains.js';
import { ServiceActorVersionRepos } from './ServiceActorVersionRepos.js';
import { ServiceAgentNodeRepos } from './ServiceAgentNodeRepos.js';
import { ServiceAgentVersionChains } from './ServiceAgentVersionChains.js';
import { ServiceAgentVersionRepos } from './ServiceAgentVersionRepos.js';
import { ServiceChains } from './ServiceChains.js';
import { ServiceVersionArchives } from './ServiceVersionArchives.js';
import { ServiceVersionChains } from './ServiceVersionChains.js';
import { ServiceVersionRepos } from './ServiceVersionRepos.js';
import { SystemRepos } from './SystemRepos.js';
import { WorkerTelemetryLive } from './WorkerTelemetryLive.js';

/** Bind real Repo acquisition and the executing Worker's authored System. */
export const RepoServicesLive = Layer.mergeAll(
  Layer.succeed(AggregateAgentNodeRepos, {
    getRepo: getAggregateAgentNodeRepo,
  }),
  Layer.succeed(ServiceAgentNodeRepos, {
    getRepo: getServiceAgentNodeRepo,
  }),
  Layer.succeed(AggregateActorVersionArchives, {
    getRepo: props => getAggregateActorVersionArchive(props),
  }),
  Layer.succeed(AggregateVersionArchives, {
    getRepo: props => getAggregateVersionArchive(props),
  }),
  Layer.succeed(AggregateVersionChains, {
    getRepo: props => getAggregateVersionChain(props),
  }),
  Layer.succeed(AggregateActorVersionRepos, {
    getRepo: props => getAggregateActorVersionRepo(props),
  }),
  Layer.succeed(AggregateAgentVersionRepos, {
    getRepo: props => getAggregateAgentVersionRepo(props),
  }),
  Layer.succeed(AggregateChains, {
    getRepo: props => AggregateChain.getRepo(props),
  }),
  Layer.succeed(AggregateActorVersionChains, {
    getRepo: props => getAggregateActorVersionChain(props),
  }),
  Layer.succeed(AggregateAgentVersionChains, {
    getRepo: props => getAggregateAgentVersionChain(props),
  }),
  Layer.succeed(ServiceVersionChains, {
    getRepo: props => getServiceVersionChain(props),
  }),
  Layer.succeed(ServiceActorVersionArchives, {
    getRepo: props => getServiceActorVersionArchive(props),
  }),
  Layer.succeed(ServiceVersionArchives, {
    getRepo: props => getServiceVersionArchive(props),
  }),
  Layer.succeed(ServiceActorVersionRepos, {
    getRepo: props => getServiceActorVersionRepo(props),
  }),
  Layer.succeed(ServiceAgentVersionRepos, {
    getRepo: props => getServiceAgentVersionRepo(props),
  }),
  Layer.succeed(ServiceAgentVersionChains, {
    getRepo: props => getServiceAgentVersionChain(props),
  }),
  Layer.succeed(ServiceChains, {
    getRepo: props => ServiceChain.getRepo(props),
  }),
  Layer.succeed(ServiceActorVersionChains, {
    getRepo: props => getServiceActorVersionChain(props),
  }),
  Layer.succeed(ServiceVersionRepos, {
    getRepo: getServiceVersionRepo,
  }),
  WorkerTelemetryLive,
  Layer.succeed(SystemRepos, { getRepo: props => SystemRepo.getRepo(props) }),
  Layer.succeed(AggregateVersionRepos, {
    getRepo: getAggregateVersionRepo,
  }),
);
