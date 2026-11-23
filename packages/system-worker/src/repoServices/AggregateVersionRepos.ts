import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { aggregateVersionRepoNameUtils } from '../AggregateVersionRepo/aggregateVersionRepoName.js';
import type { IAggregateVersionRepo } from '../AggregateVersionRepo/types.js';
/** Acquire current resource materialization and its outgoing delivery controls. */
export class AggregateVersionRepos extends Context.Service<
  AggregateVersionRepos,
  {
    getRepo(props: {
      key: Parameters<typeof aggregateVersionRepoNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        IAggregateVersionRepo,
        | 'getRepoTableRows'
        | 'authorizeAggregateSession'
        | 'awaitCommandResult'
        | 'executeAggregateQuery'
      >,
      Effect.Error<ReturnType<typeof aggregateVersionRepoNameUtils.makeName>>
    >;
  }
>()('AggregateVersionRepos') {}
