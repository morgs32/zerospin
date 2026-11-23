import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { SystemRepo } from '../SystemRepo/SystemRepo.js';

/** Acquire the singleton SystemRepo; its methods retain their RPC boundary. */
export class SystemRepos extends Context.Service<
  SystemRepos,
  {
    getRepo: (
      props: Parameters<typeof SystemRepo.getRepo>[0],
    ) => Effect.Effect<
      Pick<
        SystemRepo,
        | 'getRepoRegistrations'
        | 'getRepoTableRows'
        | 'preflightDeployment'
        | 'registerSystemSpec'
        | 'hasAcceptedSystemSpec'
        | 'getExecutingWorkerVersion'
        | 'hasArchiveBackedAggregateHistory'
        | 'hasVersionBoundAgentInstallationStorage'
        | 'getSelectedAggregateAgentInstallations'
        | 'hasOrdinaryContinuationStorage'
        | 'getAggregateIds'
        | 'hasAggregate'
        | 'initialize'
        | 'createSessionWebSocketTicket'
      >,
      Effect.Error<ReturnType<typeof SystemRepo.getRepo>>
    >;
  }
>()('SystemRepos') {}
