import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import type { aggregateVersionChainNameUtils } from '../AggregateVersionChain/aggregateVersionChainName.js';
export class AggregateVersionChains extends Context.Service<
  AggregateVersionChains,
  {
    getRepo(props: {
      key: Parameters<typeof aggregateVersionChainNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        AggregateVersionChain,
        | 'getEvaluatedCommand'
        | 'getEvaluatedCommandPage'
        | 'appendEvaluatedCommands'
        | 'getRepoTableRows'
      > & {
        readonly actorVersionChainFanout: PromiseLike<
          Disposable &
            Pick<
              AggregateVersionChain['actorVersionChainFanout'],
              'getPage' | 'subscribe'
            >
        >;
        readonly agentVersionChainFanout: PromiseLike<
          Disposable &
            Pick<
              AggregateVersionChain['agentVersionChainFanout'],
              'getPage' | 'subscribe'
            >
        >;
      },
      Effect.Error<ReturnType<typeof aggregateVersionChainNameUtils.makeName>>
    >;
  }
>()('AggregateVersionChains') {}
