import { type IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { provisionDb } from '../../provisionDb/provisionDb.ts';
import type { IDb, IDbConfig } from '../../types.ts';

import { makeInMemorySqljsDb } from './makeInMemorySqljsDb/makeInMemorySqljsDb.ts';

/** Builds an in-memory Drizzle db and runs `provisionDb` once. Each call uses a new empty DB. */
export const makeProvisionedInMemorySqljsDb = Effect.fn(
  'makeProvisionedInMemorySqljsDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<IDb<CONFIG>, IAnyError, never> {
  const { dbConfig } = props;
  const db = yield* makeInMemorySqljsDb({ dbConfig });
  yield* provisionDb({ db, definition: dbConfig.definition });
  return db;
});
