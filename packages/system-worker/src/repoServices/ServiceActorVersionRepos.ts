import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceActorVersionRepo } from '../ServiceActorVersionRepo/ServiceActorVersionRepo.js';

/** Acquire the resource/progress owner for one exact service actor projection. */
export class ServiceActorVersionRepos extends Context.Service<
  ServiceActorVersionRepos,
  {
    getRepo: (
      props: Parameters<typeof ServiceActorVersionRepo.getRepo>[0],
    ) => Effect.Effect<
      Pick<ServiceActorVersionRepo, 'getRepoTableRows' | 'getSnapshot'>,
      Effect.Error<ReturnType<typeof ServiceActorVersionRepo.getRepo>>
    >;
  }
>()('ServiceActorVersionRepos') {}
