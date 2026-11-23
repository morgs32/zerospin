import { getServiceAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import * as Effect from 'effect/Effect';

import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { serviceAgentProjectionDbConfig } from '../serviceAgentProjection/serviceAgentProjectionDbConfig.js';

import { serviceAgentVersionRepoName } from './serviceAgentVersionRepoName.js';

export const serviceAgentVersionRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [],
    ...serviceAgentVersionRepoName,
    dbConfig: Effect.fn('ServiceAgentVersionRepo.dbConfig')(function* ({
      key,
    }) {
      const system = yield* System;
      getServiceAgentRelease(system, key);
      const serviceRelease = yield* getByKeyOrThrow({
        record: system.services[key.serviceName]?.releases ?? {},
        key: key.serviceVersion,
        recordKind: 'service versions',
      });
      return makeResourceDbConfig({
        models: serviceRelease.models,
        otherTables: serviceAgentProjectionDbConfig.tables,
      });
    }),
  });
