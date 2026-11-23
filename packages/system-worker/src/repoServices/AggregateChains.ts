import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateChain } from '../AggregateChain/AggregateChain.js';
import type { aggregateChainNameUtils } from '../AggregateChain/aggregateChainName.js';

/** Acquire a AggregateChain; its methods retain their RPC boundary. */
export class AggregateChains extends Context.Service<
  AggregateChains,
  {
    getRepo: (props: {
      key: Parameters<typeof aggregateChainNameUtils.makeName>[0];
    }) => Effect.Effect<
      Pick<
        AggregateChain,
        | 'admitFromAggregateChain'
        | 'admitFromServiceChain'
        | 'admitFromAggregateAgentNode'
        | 'admitDirectSystemCommand'
        | 'getRepoTableRows'
        | 'executeCommandsThrough'
        | 'admitAggregateCommands'
        | 'registerNode'
        | 'getAggregateCommand'
        | 'prepareAggregatePredecessor'
        | 'catchupAggregatePredecessor'
      > & {
        readonly replayCommandsFanout: PromiseLike<
          Disposable &
            Pick<
              AggregateChain['replayCommandsFanout'],
              'getPage' | 'subscribe'
            >
        >;
      },
      Effect.Error<ReturnType<typeof aggregateChainNameUtils.makeName>>
    >;
  }
>()('AggregateChains') {}
