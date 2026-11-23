import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const serviceVersionArchiveName = {
  abbreviation: systemWorkerAbbreviations.serviceVersionArchive,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
    serviceVersion: VersionFromStringSchema,
    firstServiceIndex: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:firstServiceIndex',
  ),
};
export const serviceVersionArchiveNameUtils = makeRepoNameUtils(
  serviceVersionArchiveName,
);
