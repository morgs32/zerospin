import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { asc, gte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { ServiceVersionChains } from '../repoServices/ServiceVersionChains.js';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Choose a VersionChain with durable publication proof for the requested prefix. */
export const getPublishedServiceHistory = Effect.fn(
  'ServiceChain.getPublishedServiceHistory',
)(function* (props: {
  db: IDb;
  key: { systemId: string; serviceName: string };
  throughIndex: number;
}) {
  const { replaySubscribers } = serviceChainDbConfig.schema;
  const publisher = props.db
    .select({ serviceVersion: replaySubscribers.serviceVersion })
    .from(replaySubscribers)
    .where(gte(replaySubscribers.acknowledgedServiceIndex, props.throughIndex))
    .orderBy(asc(replaySubscribers.serviceVersion))
    .get();
  if (publisher === undefined) {
    return yield* makeZerospinError('service-finalized-history-missing');
  }
  return yield* (yield* ServiceVersionChains).getRepo({
    key: { ...props.key, serviceVersion: publisher.serviceVersion },
  });
});
