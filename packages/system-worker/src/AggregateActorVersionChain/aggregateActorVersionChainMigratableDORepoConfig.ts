import { aggregateSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { aggregateActorVersionChainName } from './aggregateActorVersionChainName.js';

/** Retained Actor history does not depend on an authored release being available. */
export const aggregateActorVersionChainMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...aggregateActorVersionChainName,
    dbConfig: aggregateSessionChainDbConfig,
  });
