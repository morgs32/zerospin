import type { ITx } from '@zerospin/core/drizzle/types';
import { eq, lte, sql } from 'drizzle-orm';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Adopt the published prefix, retaining the previous selection until fully covered. */
export function adoptCanonicalServiceHistory(
  tx: ITx<typeof serviceChainDbConfig>,
  props: { serviceVersion: number; publishedThrough: number },
) {
  const { serviceVersion, publishedThrough } = props;
  const { canonicalHistory, finalizedPosition, commands, replaySubscribers } =
    serviceChainDbConfig.schema;
  const finalizedThrough =
    tx.select().from(finalizedPosition).get()?.lastIndex ?? 0;
  const serviceIndex = Math.min(publishedThrough, finalizedThrough);
  if (serviceIndex === 0) return finalizedThrough === 0;
  const previous = tx.select().from(canonicalHistory).get();
  if (previous !== undefined && serviceIndex < previous.serviceIndex) {
    return false;
  }
  if (
    previous?.serviceVersion === serviceVersion &&
    serviceIndex === previous.serviceIndex
  ) {
    return serviceIndex === finalizedThrough;
  }
  tx.update(replaySubscribers)
    .set({
      acknowledgedServiceIndex: sql`max(${replaySubscribers.acknowledgedServiceIndex}, ${serviceIndex})`,
    })
    .where(eq(replaySubscribers.serviceVersion, serviceVersion))
    .run();
  tx.insert(canonicalHistory)
    .values({ singleton: 1, serviceVersion, serviceIndex })
    .onConflictDoUpdate({
      target: canonicalHistory.singleton,
      set: { serviceVersion, serviceIndex },
    })
    .run();
  tx.delete(commands).where(lte(commands.serviceIndex, serviceIndex)).run();
  return serviceIndex === finalizedThrough;
}
