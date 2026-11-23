import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical AggregateActorVersionRepo identity shared by lookup and inspection. */
export const aggregateActorVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.aggregateActorVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: VersionFromStringSchema,
    actorName: Schema.String,
    actorVersion: VersionFromStringSchema,
    actorPath: Schema.String,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:actorName/:actorVersion/:actorPath',
  ),
};

export const aggregateActorVersionRepoNameUtils = makeRepoNameUtils(
  aggregateActorVersionRepoName,
);
