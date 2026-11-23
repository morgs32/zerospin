import { env } from 'cloudflare:workers';

import { aggregateActorVersionArchiveNameUtils } from '../AggregateActorVersionArchive/aggregateActorVersionArchiveName.js';
import { aggregateActorVersionChainNameUtils } from '../AggregateActorVersionChain/aggregateActorVersionChainName.js';
import { aggregateActorVersionRepoNameUtils } from '../AggregateActorVersionRepo/aggregateActorVersionRepoName.js';
import { aggregateAgentVersionChainNameUtils } from '../AggregateAgentVersionChain/aggregateAgentVersionChainName.js';
import { aggregateAgentVersionRepoNameUtils } from '../AggregateAgentVersionRepo/aggregateAgentVersionRepoName.js';
import { aggregateVersionArchiveNameUtils } from '../AggregateVersionArchive/aggregateVersionArchiveName.js';
import { aggregateVersionChainNameUtils } from '../AggregateVersionChain/aggregateVersionChainName.js';
import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';
import { serviceActorVersionArchiveNameUtils } from '../ServiceActorVersionArchive/serviceActorVersionArchiveName.js';
import { serviceActorVersionChainNameUtils } from '../ServiceActorVersionChain/serviceActorVersionChainName.js';
import { serviceActorVersionRepoNameUtils } from '../ServiceActorVersionRepo/serviceActorVersionRepoName.js';
import { serviceAgentVersionChainNameUtils } from '../ServiceAgentVersionChain/serviceAgentVersionChainName.js';
import { serviceAgentVersionRepoNameUtils } from '../ServiceAgentVersionRepo/serviceAgentVersionRepoName.js';
import { serviceVersionArchiveNameUtils } from '../ServiceVersionArchive/serviceVersionArchiveName.js';
import { serviceVersionChainNameUtils } from '../ServiceVersionChain/serviceVersionChainName.js';

import { bindReleaseRepoNamespace } from './bindReleaseRepoNamespace.js';

export const getAggregateVersionChain = bindReleaseRepoNamespace(
  aggregateVersionChainNameUtils,
  'AGGREGATE_VERSION_CHAIN',
  (worker, key) => worker.getAggregateVersionChain(key),
);

export const getAggregateVersionArchive = bindReleaseRepoNamespace(
  aggregateVersionArchiveNameUtils,
  'AGGREGATE_VERSION_ARCHIVE',
  (worker, key) => worker.getAggregateVersionArchive(key),
);

export const getAggregateActorVersionRepo = bindReleaseRepoNamespace(
  aggregateActorVersionRepoNameUtils,
  'AGGREGATE_ACTOR_VERSION_REPO',
  (worker, key) => worker.getAggregateActorVersionRepo(key),
);

export const getAggregateActorVersionChain = bindReleaseRepoNamespace(
  aggregateActorVersionChainNameUtils,
  'AGGREGATE_ACTOR_VERSION_CHAIN',
  (worker, key) => worker.getAggregateActorVersionChain(key),
);

export const getAggregateActorVersionArchive = bindReleaseRepoNamespace(
  aggregateActorVersionArchiveNameUtils,
  'AGGREGATE_ACTOR_VERSION_ARCHIVE',
  (worker, key) => worker.getAggregateActorVersionArchive(key),
);

export const getAggregateAgentVersionRepo = bindRepoNamespace(
  aggregateAgentVersionRepoNameUtils,
  'AGGREGATE_AGENT_VERSION_REPO',
);

export const getAggregateAgentVersionChain = bindRepoNamespace(
  aggregateAgentVersionChainNameUtils,
  'AGGREGATE_AGENT_VERSION_CHAIN',
);

export const getServiceVersionChain = bindReleaseRepoNamespace(
  serviceVersionChainNameUtils,
  'SERVICE_VERSION_CHAIN',
  (worker, key) => worker.getServiceVersionChain(key),
  key => env.ZEROSPIN_HOSTED_SERVICE_DISPATCH?.getServiceVersionChain(key),
);

export const getServiceVersionArchive = bindReleaseRepoNamespace(
  serviceVersionArchiveNameUtils,
  'SERVICE_VERSION_ARCHIVE',
  (worker, key) => worker.getServiceVersionArchive(key),
  key => env.ZEROSPIN_HOSTED_SERVICE_DISPATCH?.getServiceVersionArchive(key),
);

export const getServiceActorVersionRepo = bindReleaseRepoNamespace(
  serviceActorVersionRepoNameUtils,
  'SERVICE_ACTOR_VERSION_REPO',
  (worker, key) => worker.getServiceActorVersionRepo(key),
);

export const getServiceActorVersionChain = bindReleaseRepoNamespace(
  serviceActorVersionChainNameUtils,
  'SERVICE_ACTOR_VERSION_CHAIN',
  (worker, key) => worker.getServiceActorVersionChain(key),
);

export const getServiceActorVersionArchive = bindReleaseRepoNamespace(
  serviceActorVersionArchiveNameUtils,
  'SERVICE_ACTOR_VERSION_ARCHIVE',
  (worker, key) => worker.getServiceActorVersionArchive(key),
);

export const getServiceAgentVersionRepo = bindRepoNamespace(
  serviceAgentVersionRepoNameUtils,
  'SERVICE_AGENT_VERSION_REPO',
);

export const getServiceAgentVersionChain = bindRepoNamespace(
  serviceAgentVersionChainNameUtils,
  'SERVICE_AGENT_VERSION_CHAIN',
);
