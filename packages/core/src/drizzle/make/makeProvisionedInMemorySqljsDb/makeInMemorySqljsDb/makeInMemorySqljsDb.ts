import { type IAnyError } from '@zerospin/error';
import { drizzle } from 'drizzle-orm/sql-js';
import * as Effect from 'effect/Effect';

import type { IDb, IDbConfig, IDbConfigRelations } from '../../../types.ts';

import { makeInMemorySqlJsDatabase } from './makeInMemorySqlJsDatabase/makeInMemorySqlJsDatabase.ts';

export const makeInMemorySqljsDb = Effect.fn('makeInMemorySqljsDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IDb<CONFIG>, IAnyError, never> {
  yield* Effect.void;
  const { dbConfig } = props;
  const client = yield* Effect.promise(() => makeInMemorySqlJsDatabase());
  return drizzle<IDbConfigRelations<CONFIG>>(client, {
    relations: dbConfig.relations,
  });
});
