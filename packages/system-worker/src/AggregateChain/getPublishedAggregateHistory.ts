import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { asc, gte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { AggregateVersionChains } from '../repoServices/AggregateVersionChains.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** Choose a VersionChain with durable publication proof for the requested prefix. */
export const getPublishedAggregateHistory = Effect.fn(
  'AggregateChain.getPublishedAggregateHistory',
)(function* (props: {
  db: IDb;
  key: { systemId: string; aggregateId: string; aggregateName: string };
  throughIndex: number;
}) {
  const { replaySubscribers } = aggregateChainDbConfig.schema;
  const publisher = props.db
    .select({ aggregateVersion: replaySubscribers.aggregateVersion })
    .from(replaySubscribers)
    .where(
      gte(replaySubscribers.acknowledgedAggregateIndex, props.throughIndex),
    )
    .orderBy(asc(replaySubscribers.aggregateVersion))
    .get();
  if (publisher === undefined) {
    return yield* makeZerospinError('aggregate-history-missing');
  }
  return yield* (yield* AggregateVersionChains).getRepo({
    key: { ...props.key, aggregateVersion: publisher.aggregateVersion },
  });
});
