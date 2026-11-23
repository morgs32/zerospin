import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceChain } from '../ServiceChain/ServiceChain.js';

/** Acquire a ServiceChain; its methods retain their RPC boundary. */
export class ServiceChains extends Context.Service<
  ServiceChains,
  {
    getRepo: (
      props: Parameters<typeof ServiceChain.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        ServiceChain,
        | 'admitDirectSystemCommand'
        | 'admitFromAggregateChain'
        | 'admitFromServiceChain'
        | 'admitFromServiceAgentNode'
        | 'getRepoTableRows'
        | 'awaitStartup'
        | 'executeCommandsThrough'
        | 'admitServiceCommands'
        | 'registerNode'
        | 'getServiceCommand'
        | 'prepareServiceReplayInput'
      > & {
        readonly replayCommandsFanout: PromiseLike<
          Disposable &
            Pick<ServiceChain['replayCommandsFanout'], 'getPage' | 'subscribe'>
        >;
      },
      Effect.Error<ReturnType<typeof ServiceChain.getRepo>>
    >;
  }
>()('ServiceChains') {}
