import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IServiceRegistry } from '../service/types.ts';

import type { IAnyServiceActorRelease } from './types.ts';

/** Resolve actor identity across supported service versions, never by latest. */
export function getServiceActorVersion(
  serviceRegistry: IServiceRegistry,
  identity: { actorName: string; actorVersion: number },
): IAnyServiceActorRelease {
  let result: IAnyServiceActorRelease | undefined;
  for (const serviceRelease of Object.values(serviceRegistry)) {
    const actor = serviceRelease.actors[identity.actorName];
    if (actor?.version !== identity.actorVersion) continue;
    if (result !== undefined && result !== actor) {
      throw makeZerospinError({
        code: 'actor-version-conflict',
        message: `Conflicting actor ${identity.actorName}@${identity.actorVersion}`,
      });
    }
    result = actor;
  }
  if (result === undefined) {
    throw makeZerospinError({
      code: 'actor-version-unsupported',
      message: `Unsupported actor ${identity.actorName}@${identity.actorVersion}`,
    });
  }
  return result;
}

export const resolveServiceActorVersion = Effect.fn(
  'resolveServiceActorVersion',
)(function* (...args: Parameters<typeof getServiceActorVersion>) {
  return yield* Effect.try({
    try: () => getServiceActorVersion(...args),
    catch: error =>
      ensureZerospinError({ code: 'actor-version-invalid', error }),
  });
});
