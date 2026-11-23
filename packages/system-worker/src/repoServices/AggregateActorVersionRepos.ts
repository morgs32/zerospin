import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';

/** Acquire the resource/progress owner for an exact actor projection. */
export class AggregateActorVersionRepos extends Context.Service<
  AggregateActorVersionRepos,
  {
    getRepo: (
      props: Parameters<typeof AggregateActorVersionRepo.getRepo>[0],
    ) => Effect.Effect<
      Pick<AggregateActorVersionRepo, 'getRepoTableRows' | 'getSnapshot'>,
      Effect.Error<ReturnType<typeof AggregateActorVersionRepo.getRepo>>
    >;
  }
>()('AggregateActorVersionRepos') {}
