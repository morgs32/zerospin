import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical ServiceActorVersionChain identity shared by lookup and inspection. */
export const serviceActorVersionChainName = {
  abbreviation: systemWorkerAbbreviations.serviceActorVersionChain,
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

export const serviceActorVersionChainNameUtils = makeRepoNameUtils(
  serviceActorVersionChainName,
);
