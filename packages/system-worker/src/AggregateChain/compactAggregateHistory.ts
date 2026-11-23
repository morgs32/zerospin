import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq, lte } from 'drizzle-orm';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** Delete the finalized prefix covered by release delivery and durable VersionChain history. */
export function compactAggregateHistory(
  tx: ITx,
  listedAggregateVersions: readonly number[],
) {
  const { commandProgress, commands, replaySubscribers } =
    aggregateChainDbConfig.schema;
  const progress = tx
    .select()
    .from(commandProgress)
    .where(eq(commandProgress.singleton, 1))
    .get();
  if (progress === undefined) {
    throw makeZerospinError('aggregate-command-progress-missing');
  }
  const replayThroughByVersion = new Map<number, number>();
  let publishedThroughIndex = 0;
  for (const subscriber of tx.select().from(replaySubscribers).all()) {
    replayThroughByVersion.set(
      subscriber.aggregateVersion,
      Math.max(
        subscriber.initializationThroughIndex,
        subscriber.acknowledgedAggregateIndex,
      ),
    );
    publishedThroughIndex = Math.max(
      publishedThroughIndex,
      subscriber.acknowledgedAggregateIndex,
    );
  }
  let compactedThroughIndex = Math.min(
    progress.finalizedThroughIndex,
    publishedThroughIndex,
  );
  for (const version of listedAggregateVersions) {
    compactedThroughIndex = Math.min(
      compactedThroughIndex,
      replayThroughByVersion.get(version) ?? 0,
    );
  }
  if (compactedThroughIndex <= progress.compactedThroughIndex) return;
  tx.update(commandProgress)
    .set({ compactedThroughIndex })
    .where(eq(commandProgress.singleton, 1))
    .run();
  tx.delete(commands)
    .where(lte(commands.aggregateIndex, compactedThroughIndex))
    .run();
}
