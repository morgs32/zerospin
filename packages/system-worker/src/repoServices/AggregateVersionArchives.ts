import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { AggregateVersionArchive } from '../AggregateVersionArchive/AggregateVersionArchive.js';
import type { aggregateVersionArchiveNameUtils } from '../AggregateVersionArchive/aggregateVersionArchiveName.js';

export class AggregateVersionArchives extends Context.Service<
  AggregateVersionArchives,
  {
    getRepo(props: {
      key: Parameters<typeof aggregateVersionArchiveNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        AggregateVersionArchive,
        | 'getEvaluatedCommand'
        | 'appendEvaluatedCommands'
        | 'getPage'
        | 'getRepoTableRows'
      >,
      Effect.Error<ReturnType<typeof aggregateVersionArchiveNameUtils.makeName>>
    >;
  }
>()('AggregateVersionArchives') {}
