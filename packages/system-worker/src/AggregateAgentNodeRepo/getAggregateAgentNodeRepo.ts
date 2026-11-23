import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';

import { aggregateAgentNodeRepoMigratableDORepoConfig } from './aggregateAgentNodeRepoMigratableDORepoConfig.js';

export const getAggregateAgentNodeRepo = bindRepoNamespace(
  aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils,
  'AGGREGATE_AGENT_NODE_REPO',
);
