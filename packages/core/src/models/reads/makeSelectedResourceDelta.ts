import { isEqual } from 'es-toolkit';

import type { IEncodedResourceShape } from '../types.ts';

/** Compare two selected graphs without reading or changing projection storage. */
export function makeSelectedResourceDelta<
  Resource extends IEncodedResourceShape,
>(props: { before: readonly Resource[]; after: readonly Resource[] }) {
  const { before: previousResources, after: nextResources } = props;

  const before = new Map(
    previousResources.map(resource => [
      `${resource.modelName}\u0000${resource.id}`,
      resource,
    ]),
  );
  const after = new Set(
    nextResources.map(resource => `${resource.modelName}\u0000${resource.id}`),
  );
  return {
    upserted: nextResources.filter(resource => {
      const previous = before.get(`${resource.modelName}\u0000${resource.id}`);
      return previous === undefined || !isEqual(previous, resource);
    }),
    deleted: previousResources
      .filter(
        resource => !after.has(`${resource.modelName}\u0000${resource.id}`),
      )
      .map(resource => ({ modelName: resource.modelName, id: resource.id })),
  };
}
