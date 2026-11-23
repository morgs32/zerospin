import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceActorVersionArchive } from '../ServiceActorVersionArchive/ServiceActorVersionArchive.js';
import type { serviceActorVersionArchiveNameUtils } from '../ServiceActorVersionArchive/serviceActorVersionArchiveName.js';

export class ServiceActorVersionArchives extends Context.Service<
  ServiceActorVersionArchives,
  {
    getRepo(props: {
      key: Parameters<typeof serviceActorVersionArchiveNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        ServiceActorVersionArchive,
        | 'getExposedCommand'
        | 'appendExposedCommands'
        | 'getPage'
        | 'getResolutionSummary'
        | 'getRepoTableRows'
      >,
      Effect.Error<
        ReturnType<typeof serviceActorVersionArchiveNameUtils.makeName>
      >
    >;
  }
>()('ServiceActorVersionArchives') {}
