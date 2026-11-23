import type { IDb } from '@zerospin/core/drizzle/types';
import { and, asc, isNull, lte } from 'drizzle-orm';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** The oldest admitted command without its retained original outcome is pending. */
export function readPendingServiceCommand(db: IDb, throughIndex?: number) {
  const { commands } = serviceChainDbConfig.schema;
  return db
    .select()
    .from(commands)
    .where(
      and(
        isNull(commands.outcome),
        throughIndex === undefined
          ? undefined
          : lte(commands.serviceIndex, throughIndex),
      ),
    )
    .orderBy(asc(commands.serviceIndex))
    .limit(1)
    .get();
}
