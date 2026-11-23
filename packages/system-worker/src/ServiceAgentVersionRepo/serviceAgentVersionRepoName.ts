import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical identity of one Agent's selected view at an exact Service release. */
export const serviceAgentVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.serviceAgentVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
    serviceVersion: VersionFromStringSchema,
    agentName: Schema.String,
    agentVersion: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:agentName/:agentVersion',
  ),
};

export const serviceAgentVersionRepoNameUtils = makeRepoNameUtils(
  serviceAgentVersionRepoName,
);
