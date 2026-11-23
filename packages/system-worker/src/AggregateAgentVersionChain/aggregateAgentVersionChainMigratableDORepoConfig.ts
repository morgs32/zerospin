import { getAggregateAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { System } from '@zerospin/core/system/System';
import * as Effect from 'effect/Effect';

import { aggregateAgentSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { aggregateAgentVersionChainName } from './aggregateAgentVersionChainName.js';

/** Retained public history remains deliverable when the named Agent changes its owner pin. */
export const aggregateAgentVersionChainMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...aggregateAgentVersionChainName,
    dbConfig: Effect.fn('AggregateAgentVersionChain.dbConfig')(
      function* (props) {
        const { key } = props;
        const system = yield* System;
        getAggregateAgentRelease(system, key);
        return aggregateAgentSessionChainDbConfig;
      },
    ),
  });
