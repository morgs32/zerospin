import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateActorVersionArchive } from '../AggregateActorVersionArchive/AggregateActorVersionArchive.js';
import type { aggregateActorVersionArchiveNameUtils } from '../AggregateActorVersionArchive/aggregateActorVersionArchiveName.js';

export class AggregateActorVersionArchives extends Context.Service<
  AggregateActorVersionArchives,
  {
    getRepo(props: {
      key: Parameters<typeof aggregateActorVersionArchiveNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        AggregateActorVersionArchive,
        | 'getExposedCommand'
        | 'appendExposedCommands'
        | 'getPage'
        | 'getResolutionSummary'
        | 'getRepoTableRows'
      >,
      Effect.Error<
        ReturnType<typeof aggregateActorVersionArchiveNameUtils.makeName>
      >
    >;
  }
>()('AggregateActorVersionArchives') {}
