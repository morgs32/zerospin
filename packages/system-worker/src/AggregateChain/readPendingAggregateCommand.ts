import type { IDb } from '@zerospin/core/drizzle/types';
import { and, asc, isNull, lte } from 'drizzle-orm';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** The oldest admitted command without a retained outcome is pending. */
export function readPendingAggregateCommand(db: IDb, throughIndex?: number) {
  const { commands } = aggregateChainDbConfig.schema;
  return db
    .select()
    .from(commands)
    .where(
      and(
        isNull(commands.outcome),
        throughIndex === undefined
          ? undefined
          : lte(commands.aggregateIndex, throughIndex),
      ),
    )
    .orderBy(asc(commands.aggregateIndex))
    .limit(1)
    .get();
}
