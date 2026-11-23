import { RoutePattern } from '@remix-run/route-pattern';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical ServiceChain identity shared by lookup and inspection. */
export const serviceChainName = {
  abbreviation: systemWorkerAbbreviations.serviceChain,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    serviceName: Schema.String,
  }),
  namePattern: RoutePattern.parse('/:systemId/:serviceName'),
};

export const serviceChainNameUtils = makeRepoNameUtils(serviceChainName);
