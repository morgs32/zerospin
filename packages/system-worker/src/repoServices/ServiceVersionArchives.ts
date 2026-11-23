import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

import type { ServiceVersionArchive } from '../ServiceVersionArchive/ServiceVersionArchive.js';
import type { serviceVersionArchiveNameUtils } from '../ServiceVersionArchive/serviceVersionArchiveName.js';

export class ServiceVersionArchives extends Context.Service<
  ServiceVersionArchives,
  {
    getRepo(props: {
      key: Parameters<typeof serviceVersionArchiveNameUtils.makeName>[0];
    }): Effect.Effect<
      Pick<
        ServiceVersionArchive,
        | 'getEvaluatedCommand'
        | 'appendEvaluatedCommands'
        | 'getPage'
        | 'getRepoTableRows'
      >,
      Effect.Error<ReturnType<typeof serviceVersionArchiveNameUtils.makeName>>
    >;
  }
>()('ServiceVersionArchives') {}
