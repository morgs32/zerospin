import type { IAggregateNodeBaseline } from '@zerospin/core/AggregateNode/types';
import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
export function makeAggregateNodeBaseline(
  snapshot: IAggregateSessionSnapshot,
): IAggregateNodeBaseline {
  return {
    dispositionChainHash: snapshot.dispositionChainHash,
    resolvedThrough: snapshot.resolvedThrough,
    aggregateIndex: snapshot.aggregateIndex,
    resources: snapshot.resources,
  };
}
