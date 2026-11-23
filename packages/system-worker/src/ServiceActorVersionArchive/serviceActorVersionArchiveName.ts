import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { serviceActorVersionChainName } from '../ServiceActorVersionChain/serviceActorVersionChainName.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const serviceActorVersionArchiveName = {
  abbreviation: systemWorkerAbbreviations.serviceActorVersionArchive,
  keyCodec: Schema.Struct({
    ...serviceActorVersionChainName.keyCodec.fields,
    firstServiceIndex: VersionFromStringSchema.check(
      Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
    ),
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:actorName/:actorVersion/:actorPath/:firstServiceIndex',
  ),
};

export const serviceActorVersionArchiveNameUtils = makeRepoNameUtils(
  serviceActorVersionArchiveName,
);
