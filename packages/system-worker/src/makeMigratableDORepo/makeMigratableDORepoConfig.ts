import type { IDbConfig } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';

import {
  makeDORepoConfig,
  type IDORepoConfigProps,
} from '../makeDORepo/makeDORepoConfig.js';

import type { IMigratableDORepoMigration } from './types.js';

/** Bind the physical Repo configuration to its immutable ordered migrations. */
export function makeMigratableDORepoConfig<
  const PATTERN extends string,
  KEY,
  CONFIG extends IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
>(
  props: IDORepoConfigProps<
    PATTERN,
    KEY,
    CONFIG,
    SERVICES,
    GET_DB_CONFIG_ERROR,
    BOOTSTRAP_ERROR
  > & { migrations: readonly IMigratableDORepoMigration[] },
) {
  return {
    ...makeDORepoConfig(props),
    migrations: Object.freeze(
      props.migrations.map(migration =>
        Object.freeze({
          ...migration,
          sql: Object.freeze([...migration.sql]),
        }),
      ),
    ),
  };
}
