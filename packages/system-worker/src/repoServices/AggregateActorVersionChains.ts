import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { Server } from 'partyserver';

import type { AggregateActorVersionChain } from '../AggregateActorVersionChain/AggregateActorVersionChain.js';

/** Acquire a AggregateActorVersionChain; its methods retain their RPC boundary. */
export class AggregateActorVersionChains extends Context.Service<
  AggregateActorVersionChains,
  {
    getRepo: (
      props: Parameters<typeof AggregateActorVersionChain.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        AggregateActorVersionChain,
        | 'getRepoTableRows'
        | 'getBrowserCommands'
        | 'getResolvedThrough'
        | 'appendExposedCommands'
        | 'getCheckpoint'
      > & {
        readonly fetch: Server['fetch'];
      },
      Effect.Error<ReturnType<typeof AggregateActorVersionChain.getRepo>>
    >;
  }
>()('AggregateActorVersionChains') {}
