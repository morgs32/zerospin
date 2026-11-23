import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeFn } from '@zerospin/logger';
import { and, eq } from 'drizzle-orm';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Check the exact aggregate name and ID within the owning SystemRepo. */
export const hasAggregate = makeFn('SystemRepo.hasAggregate')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    aggregateName: string;
    aggregateId: IAggregateId;
  }) {
    const { db, aggregateName, aggregateId } = props;
    return (
      db
        .select({
          aggregateId: systemRepoDbConfig.schema.aggregates.aggregateId,
        })
        .from(systemRepoDbConfig.schema.aggregates)
        .where(
          and(
            eq(
              systemRepoDbConfig.schema.aggregates.aggregateName,
              aggregateName,
            ),
            eq(systemRepoDbConfig.schema.aggregates.aggregateId, aggregateId),
          ),
        )
        .get() !== undefined
    );
  },
);
