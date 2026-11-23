import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { getServiceVersionRepo } from '../ServiceVersionRepo/getServiceVersionRepo.js';
import type { IServiceVersionRepo } from '../ServiceVersionRepo/types.js';

/** Acquire a ServiceVersionRepo; its methods retain their RPC boundary. */
export class ServiceVersionRepos extends Context.Service<
  ServiceVersionRepos,
  {
    getRepo: (
      props: Parameters<typeof getServiceVersionRepo>[0],
    ) => Effect.Effect<
      Pick<
        IServiceVersionRepo,
        | 'getRepoTableRows'
        | 'awaitStartup'
        | 'authorizeServiceSession'
        | 'awaitCommandResult'
        | 'executeServiceQuery'
      >,
      Effect.Error<ReturnType<typeof getServiceVersionRepo>>
    >;
  }
>()('ServiceVersionRepos') {}
