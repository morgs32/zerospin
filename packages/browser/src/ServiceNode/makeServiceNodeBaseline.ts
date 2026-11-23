import type { IServiceNodeBaseline } from '@zerospin/core/ServiceNode/types';
import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
export function makeServiceNodeBaseline(
  snapshot: IServiceSessionSnapshot,
): IServiceNodeBaseline {
  return {
    serviceIndex: snapshot.serviceIndex,
    dispositionChainHash: snapshot.dispositionChainHash,
    resolvedThrough: snapshot.resolvedThrough,
    resources: snapshot.resources,
  };
}
