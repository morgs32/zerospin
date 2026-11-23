import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IRepoNameUtils } from './makeRepoNameUtils.js';

export type IDORepoConfig<
  KEY,
  CONFIG extends IDbConfig = IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
> = {
  nameUtils: IRepoNameUtils<KEY>;
  dbConfig: (props: {
    key: KEY;
  }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>;
  bootstrap:
    | ((props: {
        ctx: DurableObjectState;
        name: string;
        key: KEY;
        db: IDb<CONFIG>;
        dbConfig: CONFIG;
        schema: IDbConfigSchema<CONFIG>;
      }) => Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES>)
    | null;
};
