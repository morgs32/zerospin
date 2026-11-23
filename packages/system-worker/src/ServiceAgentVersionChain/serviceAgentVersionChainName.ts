import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Service Agent history is bound to one exact Service release and named Agent. */
export const serviceAgentVersionChainName = {
  abbreviation: systemWorkerAbbreviations.serviceAgentVersionChain,
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

export const serviceAgentVersionChainNameUtils = makeRepoNameUtils(
  serviceAgentVersionChainName,
);
