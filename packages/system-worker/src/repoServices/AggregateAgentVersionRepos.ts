import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateAgentVersionRepo } from '../AggregateAgentVersionRepo/AggregateAgentVersionRepo.js';

/** Acquire the resource/progress owner for an exact agent projection. */
export class AggregateAgentVersionRepos extends Context.Service<
  AggregateAgentVersionRepos,
  {
    getRepo: (
      props: Parameters<typeof AggregateAgentVersionRepo.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        AggregateAgentVersionRepo,
        'getRepoTableRows' | 'getSnapshot' | 'synchronizeSelectedHistory'
      >,
      Effect.Error<ReturnType<typeof AggregateAgentVersionRepo.getRepo>>
    >;
  }
>()('AggregateAgentVersionRepos') {}
