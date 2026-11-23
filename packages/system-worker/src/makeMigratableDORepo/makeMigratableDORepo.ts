import type { ISqliteTableDefinition } from '@zerospin/core/drizzle/definition/compileSqliteTableDefinition';
import type { IDb, IDbConfig } from '@zerospin/core/drizzle/types';

import {
  makeDORepo,
  type IDORepoBase,
  type IDORepoProps,
} from '../makeDORepo/makeDORepo.js';

import {
  initializeMigratableSchema,
  preflightAgentMigration,
} from './initializeMigratableSchema.js';
import type { IMigratableDORepoConfig } from './types.js';

/** Preserve existing rows and apply the Repo's ordered SQL migrations. */
export function makeMigratableDORepo<
  BASE extends IDORepoBase,
  KEY extends object,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
  SERVICES = never,
>(
  BaseClass: BASE,
  props: IDORepoProps<KEY, CONFIG, BINDING, SERVICES> & {
    readMaterializedTables?: (
      db: Pick<IDb, 'get' | 'all'>,
    ) => readonly ISqliteTableDefinition[];
    migratableDORepoConfig: IMigratableDORepoConfig<KEY, CONFIG, SERVICES>;
  },
) {
  const { migratableDORepoConfig } = props;
  const migrationConfig = {
    readMaterializedTables: props.readMaterializedTables,
    migrations: migratableDORepoConfig.migrations,
  };
  const Repo = makeDORepo(
    BaseClass,
    props,
    migratableDORepoConfig,
    activation =>
      initializeMigratableSchema({ ...activation, ...migrationConfig }),
    props.repoType === 'AggregateAgentNodeRepo' ||
      props.repoType === 'ServiceAgentNodeRepo'
      ? activation =>
          preflightAgentMigration({ ...activation, ...migrationConfig })
      : undefined,
  );
  return Object.assign(Repo, { migratableDORepoConfig });
}
