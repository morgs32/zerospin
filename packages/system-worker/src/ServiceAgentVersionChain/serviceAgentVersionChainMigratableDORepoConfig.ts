import { getServiceAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { System } from '@zerospin/core/system/System';
import * as Effect from 'effect/Effect';

import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { serviceAgentVersionChainDbConfig } from './serviceAgentVersionChainDbConfig.js';
import { serviceAgentVersionChainName } from './serviceAgentVersionChainName.js';

/** Retained public history remains deliverable when the named Agent changes its owner pin. */
export const serviceAgentVersionChainMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...serviceAgentVersionChainName,
    dbConfig: Effect.fn('ServiceAgentVersionChain.dbConfig')(function* (props) {
      const { key } = props;
      const system = yield* System;
      getServiceAgentRelease(system, key);
      return serviceAgentVersionChainDbConfig;
    }),
  });
