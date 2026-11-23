import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';
import { serviceActorVersionChainName } from './serviceActorVersionChainName.js';
export const serviceActorVersionChainMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...serviceActorVersionChainName,
    dbConfig: serviceActorVersionChainDbConfig,
  });
