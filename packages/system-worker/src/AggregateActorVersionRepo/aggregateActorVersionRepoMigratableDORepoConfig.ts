import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import { aggregateProjectionDbConfig } from '../aggregateProjection/aggregateProjectionDbConfig.js';
import { resolveAggregateProjectionView } from '../aggregateProjection/resolveAggregateProjectionView.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';

import { aggregateActorVersionRepoName } from './aggregateActorVersionRepoName.js';

export const aggregateActorVersionRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...aggregateActorVersionRepoName,
    dbConfig: Effect.fn('AggregateActorVersionRepo.dbConfig')(function* ({
      key,
    }) {
      const system = yield* System;
      const aggregateRelease = yield* getByKeyOrThrow({
        record: system.aggregates[key.aggregateName]?.releases ?? {},
        key: key.aggregateVersion,
        recordKind: 'aggregate versions',
      });
      yield* resolveAggregateProjectionView({ key, aggregateRelease });
      // Selection where.RAW can read any canonical table and declares no complete dependency graph.
      // Retain the release graph until the selection API can express that dependency boundary.
      return makeResourceDbConfig({
        models: aggregateRelease.models,
        otherTables: aggregateProjectionDbConfig.tables,
      });
    }),
  });
