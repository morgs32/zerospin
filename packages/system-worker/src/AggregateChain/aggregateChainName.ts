import { RoutePattern } from '@remix-run/route-pattern';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical AggregateChain identity shared by lookup and inspection. */
export const aggregateChainName = {
  abbreviation: systemWorkerAbbreviations.aggregateChain,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
  }),
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
};

export const aggregateChainNameUtils = makeRepoNameUtils(aggregateChainName);
