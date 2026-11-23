import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { aggregateChainName } from './aggregateChainName.js';

/**
 * Sibling of the AC class module so ServiceChain can import
 * `nameUtils` without loading `AggregateChain.ts` (cycle:
 * AC → SCC → AC).
 */
export const aggregateChainMigratableDORepoConfig = makeMigratableDORepoConfig({
  migrations: [],
  ...aggregateChainName,
  dbConfig: aggregateChainDbConfig,
});
