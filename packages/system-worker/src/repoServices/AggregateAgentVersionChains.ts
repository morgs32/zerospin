import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { Server } from 'partyserver';

import type { AggregateAgentVersionChain } from '../AggregateAgentVersionChain/AggregateAgentVersionChain.js';

/** Acquire a AggregateAgentVersionChain; its methods retain their RPC boundary. */
export class AggregateAgentVersionChains extends Context.Service<
  AggregateAgentVersionChains,
  {
    getRepo: (
      props: Parameters<typeof AggregateAgentVersionChain.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        AggregateAgentVersionChain,
        | 'getRepoTableRows'
        | 'getBrowserCommands'
        | 'appendExposedCommands'
        | 'getCheckpoint'
      > & {
        readonly nodeFanout: PromiseLike<
          Disposable &
            Pick<
              AggregateAgentVersionChain['nodeFanout'],
              'getPage' | 'subscribe'
            >
        >;
        readonly fetch: Server['fetch'];
      },
      Effect.Error<ReturnType<typeof AggregateAgentVersionChain.getRepo>>
    >;
  }
>()('AggregateAgentVersionChains') {}
