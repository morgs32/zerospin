import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IResourceDbConfig } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import { makeMigratableDORepoConfig } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepoConfig';
import type { IMigratableDORepoConfig } from '@zerospin/system-worker/makeMigratableDORepo/types';
import {
  serviceVersionRepoName,
  type serviceVersionRepoNameUtils,
} from '@zerospin/system-worker/ServiceVersionRepo/serviceVersionRepoName';
import * as Effect from 'effect/Effect';

import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';

/*
 * ServiceVersionRepo activation resolves its resource schema from the
 * physical Repo key. Name metadata stays independent of the Repo class so
 * upstream lookups can share the contract without loading its RPC dependencies.
 *
 * 1. Resolve the service from the Repo key.
 * 2. Build owner resources and progress tables.
 */
export const serviceVersionRepoMigratableDORepoConfig: IMigratableDORepoConfig<
  Parameters<typeof serviceVersionRepoNameUtils.makeName>[0],
  IResourceDbConfig<IAnyModels, typeof serviceVersionRepoDbConfig.tables>,
  System
> = makeMigratableDORepoConfig({
  migrations: [],
  ...serviceVersionRepoName,
  dbConfig: Effect.fn('ServiceVersionRepo.dbConfig')(function* ({ key }) {
    const system = yield* System;
    // 1 — reject a serviceName absent from the authored System
    const serviceRelease =
      system.services[key.serviceName]?.releases[key.serviceVersion];
    if (serviceRelease === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-service-not-found',
          message: `Service ${key.serviceName} was not found`,
        }),
      );
    }

    // 2 — supply exactly the service-owned models
    return makeResourceDbConfig({
      otherTables: {
        ...serviceVersionRepoDbConfig.tables,
      },
      models: serviceRelease.models,
    });
  }),
});
