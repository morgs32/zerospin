import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceActorVersionChain } from '../ServiceActorVersionChain/ServiceActorVersionChain.js';

/** Acquire a ServiceActorVersionChain; its methods retain their RPC boundary. */
export class ServiceActorVersionChains extends Context.Service<
  ServiceActorVersionChains,
  {
    getRepo: (
      props: Parameters<typeof ServiceActorVersionChain.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        ServiceActorVersionChain,
        | 'getRepoTableRows'
        | 'getResolvedThrough'
        | 'getBrowserCommands'
        | 'getCheckpoint'
        | 'appendExposedCommands'
        | 'awaitStartup'
      >,
      Effect.Error<ReturnType<typeof ServiceActorVersionChain.getRepo>>
    >;
  }
>()('ServiceActorVersionChains') {}
