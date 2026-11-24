import type { ITx } from '@zerospin/core/drizzle/types';
import { eq, lte } from 'drizzle-orm';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Delete the finalized prefix covered by every owed release and one publication. */
export function compactServiceHistory(
  tx: ITx,
  listedServiceVersions: readonly number[],
) {
  const { commands, finalizedPosition, replaySubscribers } =
    serviceChainDbConfig.schema;
  const progress = tx.select().from(finalizedPosition).get();
  if (progress === undefined) return;
  const coveredThroughByVersion = new Map<number, number>();
  let publishedThroughIndex = 0;
  for (const subscriber of tx.select().from(replaySubscribers).all()) {
    coveredThroughByVersion.set(
      subscriber.serviceVersion,
      Math.max(
        subscriber.initializationThroughIndex,
        subscriber.acknowledgedServiceIndex,
      ),
    );
    publishedThroughIndex = Math.max(
      publishedThroughIndex,
      subscriber.acknowledgedServiceIndex,
    );
  }
  let compactedThroughIndex = Math.min(
    progress.lastIndex,
    publishedThroughIndex,
  );
  for (const version of listedServiceVersions) {
    compactedThroughIndex = Math.min(
      compactedThroughIndex,
      coveredThroughByVersion.get(version) ?? 0,
    );
  }
  if (compactedThroughIndex <= progress.compactedThroughIndex) return;
  tx.update(finalizedPosition)
    .set({ compactedThroughIndex })
    .where(eq(finalizedPosition.singleton, 1))
    .run();
  tx.delete(commands)
    .where(lte(commands.serviceIndex, compactedThroughIndex))
    .run();
}
