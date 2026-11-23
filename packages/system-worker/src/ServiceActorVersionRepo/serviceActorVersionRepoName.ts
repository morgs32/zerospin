import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical identity of one service release's actor projection resource owner. */
export const serviceActorVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.serviceActorVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
    serviceVersion: VersionFromStringSchema,
    actorName: Schema.String,
    actorVersion: VersionFromStringSchema,
    actorPath: Schema.String,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:actorName/:actorVersion/:actorPath',
  ),
};

export const serviceActorVersionRepoNameUtils = makeRepoNameUtils(
  serviceActorVersionRepoName,
);
