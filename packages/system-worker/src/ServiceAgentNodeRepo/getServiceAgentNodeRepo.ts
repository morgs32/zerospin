import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';

import { serviceAgentNodeRepoMigratableDORepoConfig } from './serviceAgentNodeRepoMigratableDORepoConfig.js';

export const getServiceAgentNodeRepo = bindRepoNamespace(
  serviceAgentNodeRepoMigratableDORepoConfig.nameUtils,
  'SERVICE_AGENT_NODE_REPO',
);
