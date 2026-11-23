import { getAggregateAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import { aggregateAgentProjectionDbConfig } from '../aggregateProjection/aggregateProjectionDbConfig.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { aggregateAgentVersionRepoName } from './aggregateAgentVersionRepoName.js';

export const aggregateAgentVersionRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...aggregateAgentVersionRepoName,
    dbConfig: Effect.fn('AggregateAgentVersionRepo.dbConfig')(function* ({
      key,
    }) {
      const system = yield* System;
      getAggregateAgentRelease(system, key);
      const aggregateRelease = yield* getByKeyOrThrow({
        record: system.aggregates[key.aggregateName]?.releases ?? {},
        key: key.aggregateVersion,
        recordKind: 'aggregate versions',
      });
      return makeResourceDbConfig({
        models: aggregateRelease.models,
        otherTables: aggregateAgentProjectionDbConfig.tables,
      });
    }),
  });
