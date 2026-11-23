import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';
import type { serviceVersionChainNameUtils } from '../ServiceVersionChain/serviceVersionChainName.js';
export class ServiceVersionChains extends Context.Service<
  ServiceVersionChains,
  {
    getRepo(props: {
      key: Parameters<typeof serviceVersionChainNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        ServiceVersionChain,
        | 'getEvaluatedCommand'
        | 'getEvaluatedCommandPage'
        | 'getInputCheckpoint'
        | 'appendEvaluatedCommands'
        | 'getRepoTableRows'
      > & {
        readonly agentVersionRepoFanout: PromiseLike<
          Disposable &
            Pick<
              ServiceVersionChain['agentVersionRepoFanout'],
              'getPage' | 'subscribe'
            >
        >;
        readonly actorVersionRepoFanout: PromiseLike<
          Disposable &
            Pick<
              ServiceVersionChain['actorVersionRepoFanout'],
              'getPage' | 'subscribe'
            >
        >;
      },
      Effect.Error<ReturnType<typeof serviceVersionChainNameUtils.makeName>>
    >;
  }
>()('ServiceVersionChains') {}
