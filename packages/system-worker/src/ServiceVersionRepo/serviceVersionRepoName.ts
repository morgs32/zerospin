import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical ServiceVersionRepo identity shared by lookup and inspection. */
export const serviceVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.serviceVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
    serviceVersion: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
};

export const serviceVersionRepoNameUtils = makeRepoNameUtils(
  serviceVersionRepoName,
);
