import type { IDrizzleRelationsFromModels } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import type { BuildQueryResult, DBQueryConfig } from 'drizzle-orm/relations';

/** One row of a session model, with the selected columns and relations. */
export type ISessionModelRow<
  DEFINITION extends { readonly models: IAnyModels },
  MODEL extends keyof DEFINITION['models'] & string,
  OPTIONS extends DBQueryConfig<
    'one',
    IDrizzleRelationsFromModels<DEFINITION['models']>,
    IDrizzleRelationsFromModels<DEFINITION['models']>[MODEL]
  > = {},
> = BuildQueryResult<
  IDrizzleRelationsFromModels<DEFINITION['models']>,
  IDrizzleRelationsFromModels<DEFINITION['models']>[MODEL],
  OPTIONS
>;
