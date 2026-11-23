import { bindReleaseRepoNamespace } from '../ownerOperations/bindReleaseRepoNamespace.js';

import { aggregateVersionRepoNameUtils } from './aggregateVersionRepoName.js';

/** Find the materialization in the exact release Worker or colocated namespace. */
export const getAggregateVersionRepo = bindReleaseRepoNamespace(
  aggregateVersionRepoNameUtils,
  'AGGREGATE_VERSION_REPO',
  (worker, key) => worker.getAggregateVersionRepo(key),
);
