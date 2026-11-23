import type { IDb } from '@zerospin/core/drizzle/types';
import { readSelectedResources } from '@zerospin/core/models/reads/readSelectedResources';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import * as Effect from 'effect/Effect';

import { resolveServiceActorView } from './resolveServiceActorView.js';

export const readServiceResources = Effect.fn('readServiceResources')(
  function* (
    db: IDb,
    serviceRelease: IAnyServiceRelease,
    key: { actorName: string; actorVersion: number; actorPath: string },
  ) {
    const { actor, selectionBindings } = yield* resolveServiceActorView(
      serviceRelease,
      key,
    );
    return yield* readSelectedResources({
      db,
      models: serviceRelease.models,
      exposedModels: actor.exposedModels,
      requireReferenceClosure: true,
      selections: actor.capturedSelections,
      identity: selectionBindings,
    });
  },
);
