import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { Server } from 'partyserver';

import type { ServiceAgentVersionChain } from '../ServiceAgentVersionChain/ServiceAgentVersionChain.js';

/** Acquire a ServiceAgentVersionChain; its methods retain their RPC boundary. */
export class ServiceAgentVersionChains extends Context.Service<
  ServiceAgentVersionChains,
  {
    getRepo: (
      props: Parameters<typeof ServiceAgentVersionChain.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        ServiceAgentVersionChain,
        | 'getRepoTableRows'
        | 'getBrowserCommands'
        | 'appendExposedCommands'
        | 'getCheckpoint'
      > & {
        readonly nodeFanout: PromiseLike<
          Disposable &
            Pick<
              ServiceAgentVersionChain['nodeFanout'],
              'getPage' | 'subscribe'
            >
        >;
        readonly fetch: Server['fetch'];
      },
      Effect.Error<ReturnType<typeof ServiceAgentVersionChain.getRepo>>
    >;
  }
>()('ServiceAgentVersionChains') {}
