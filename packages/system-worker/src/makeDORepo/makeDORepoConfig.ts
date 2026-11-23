import type { RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import type * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from './makeRepoNameUtils.js';
import type { IDORepoConfig } from './types.js';

export type IDORepoConfigProps<
  PATTERN extends string,
  KEY,
  CONFIG extends IDbConfig,
  SERVICES = never,
  GET_DB_CONFIG_ERROR extends IAnyError = IAnyError,
  BOOTSTRAP_ERROR extends IAnyError = IAnyError,
> = {
  abbreviation?: string | null;
  namePattern: RoutePattern<PATTERN>;
  keyCodec: Schema.Codec<KEY, MatchParams<PATTERN>>;
  dbConfig:
    | CONFIG
    | ((props: {
        key: KEY;
      }) => Effect.Effect<CONFIG, GET_DB_CONFIG_ERROR, SERVICES>);
  bootstrap?: (props: {
    ctx: DurableObjectState;
    name: string;
    key: KEY;
    db: IDb<CONFIG>;
    dbConfig: CONFIG;
    schema: IDbConfigSchema<CONFIG>;
  }) => Effect.Effect<void, BOOTSTRAP_ERROR, SERVICES>;
};

export function makeDORepoConfig<
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
  >,
): IDORepoConfig<KEY, CONFIG, SERVICES, GET_DB_CONFIG_ERROR, BOOTSTRAP_ERROR> {
  const { abbreviation, bootstrap, dbConfig, namePattern, keyCodec } = props;
  return {
    nameUtils: makeRepoNameUtils({ abbreviation, namePattern, keyCodec }),
    dbConfig:
      typeof dbConfig === 'function'
        ? dbConfig
        : () => Effect.succeed(dbConfig),
    bootstrap: bootstrap ?? null,
  };
}
