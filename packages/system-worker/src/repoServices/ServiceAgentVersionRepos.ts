import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceAgentVersionRepo } from '../ServiceAgentVersionRepo/ServiceAgentVersionRepo.js';

/** Acquire the resource/progress owner for an exact agent projection. */
export class ServiceAgentVersionRepos extends Context.Service<
  ServiceAgentVersionRepos,
  {
    getRepo: (
      props: Parameters<typeof ServiceAgentVersionRepo.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        ServiceAgentVersionRepo,
        'getRepoTableRows' | 'getSnapshot' | 'synchronizeSelectedHistory'
      >,
      Effect.Error<ReturnType<typeof ServiceAgentVersionRepo.getRepo>>
    >;
  }
>()('ServiceAgentVersionRepos') {}
