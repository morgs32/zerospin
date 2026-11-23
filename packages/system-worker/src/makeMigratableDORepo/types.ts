import type { ISqliteTableDefinition } from '@zerospin/core/drizzle/definition/compileSqliteTableDefinition';
import type { IDbConfig } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';

import type { IDORepoConfig } from '../makeDORepo/types.js';

export type IMigratableDORepoMigration = {
  readonly id: number;
  readonly name: string;
  readonly sql: readonly string[];
  /** Fixed tables that must already exist before the first write of this migration. */
  readonly sourceTables?: readonly ISqliteTableDefinition[];
};

export type IPreparedDORepoMigration = IMigratableDORepoMigration & {
  readonly checksum: string;
};

export type IMigratableDORepoConfig<
  KEY,
  CONFIG extends IDbConfig = IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
> = IDORepoConfig<
  KEY,
  CONFIG,
  SERVICES,
  GET_DB_CONFIG_ERROR,
  BOOTSTRAP_ERROR
> & {
  readonly migrations: readonly IMigratableDORepoMigration[];
};
