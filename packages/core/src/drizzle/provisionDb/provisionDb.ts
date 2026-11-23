import * as Effect from 'effect/Effect';

import type { IDatabaseDefinition, IDb, IDbConfig } from '../types.ts';

import { provisionDbTx } from './provisionDbTx/provisionDbTx.ts';

export const provisionDb = Effect.fn('provisionDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  db: IDb<CONFIG>;
  definition: IDatabaseDefinition;
}) {
  const { db, definition } = props;

  yield* provisionDbTx(db, { definition });
});
