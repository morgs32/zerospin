import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
export const serviceVersionChainName = {
  abbreviation: systemWorkerAbbreviations.serviceVersionChain,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
    serviceVersion: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse('/:systemId/:serviceName/:serviceVersion'),
};
export const serviceVersionChainNameUtils = makeRepoNameUtils(
  serviceVersionChainName,
);
