import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { resolveServiceActorView } from '../serviceProjection/resolveServiceActorView.js';
import { serviceProjectionDbConfig } from '../serviceProjection/serviceProjectionDbConfig.js';

import { serviceActorVersionRepoName } from './serviceActorVersionRepoName.js';

export const serviceActorVersionRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...serviceActorVersionRepoName,
    dbConfig: Effect.fn('ServiceActorVersionRepo.dbConfig')(function* ({
      key,
    }) {
      const system = yield* System;
      const serviceRelease = yield* getByKeyOrThrow({
        record: system.services[key.serviceName]?.releases ?? {},
        key: key.serviceVersion,
        recordKind: 'service versions',
      });
      yield* resolveServiceActorView(serviceRelease, key);
      // Selection RAW SQL can read canonical tables without a complete declared dependency graph.
      return makeResourceDbConfig({
        models: serviceRelease.models,
        otherTables: serviceProjectionDbConfig.tables,
      });
    }),
  });
