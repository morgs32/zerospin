import type { IDb } from '@zerospin/core/drizzle/types';
import { makeFn } from '@zerospin/logger';
import { asc, eq } from 'drizzle-orm';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** List registered aggregate IDs for one aggregate name in stable ID order. */
export const getAggregateIds = makeFn('SystemRepo.getAggregateIds')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    aggregateName: string;
  }) {
    const { db, aggregateName } = props;
    return db
      .select({ aggregateId: systemRepoDbConfig.schema.aggregates.aggregateId })
      .from(systemRepoDbConfig.schema.aggregates)
      .where(
        eq(systemRepoDbConfig.schema.aggregates.aggregateName, aggregateName),
      )
      .orderBy(asc(systemRepoDbConfig.schema.aggregates.aggregateId))
      .all()
      .map(row => row.aggregateId);
  },
);
