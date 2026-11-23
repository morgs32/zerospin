import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import type { IAggregateRegistry } from '../aggregate/types.ts';

import type { IAnyAggregateActorRelease } from './types.ts';

/** Resolve command provenance across supported aggregate versions, never by latest. */
export function getAggregateActorVersion(
  aggregateRegistry: IAggregateRegistry,
  identity: { actorName: string; actorVersion: number },
): IAnyAggregateActorRelease {
  for (const aggregateRelease of Object.values(aggregateRegistry)) {
    const actor = aggregateRelease.actors[identity.actorName];
    if (actor?.version !== identity.actorVersion) continue;
    return actor;
  }
  throw makeZerospinError({
    code: 'actor-version-unsupported',
    message: `Unsupported actor ${identity.actorName}@${identity.actorVersion}`,
  });
}

export const resolveAggregateActorVersion = makeFn(
  'resolveAggregateActorVersion',
)(function* (...args: Parameters<typeof getAggregateActorVersion>) {
  return yield* Effect.try({
    try: () => getAggregateActorVersion(...args),
    catch: error =>
      ensureZerospinError({ code: 'actor-version-invalid', error }),
  });
});
