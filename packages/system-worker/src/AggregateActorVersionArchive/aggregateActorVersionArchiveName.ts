import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateActorVersionArchiveName = {
  abbreviation: systemWorkerAbbreviations.aggregateActorVersionArchive,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: VersionFromStringSchema,
    actorName: Schema.String,
    actorVersion: VersionFromStringSchema,
    actorPath: Schema.String,
    firstAggregateIndex: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:actorName/:actorVersion/:actorPath/:firstAggregateIndex',
  ),
};

export const aggregateActorVersionArchiveNameUtils = makeRepoNameUtils(
  aggregateActorVersionArchiveName,
);
