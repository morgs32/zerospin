import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical AggregateAgentVersionRepo identity shared by lookup and inspection. */
export const aggregateAgentVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.aggregateAgentVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: VersionFromStringSchema,
    agentName: Schema.String,
    agentVersion: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:agentName/:agentVersion',
  ),
};

export const aggregateAgentVersionRepoNameUtils = makeRepoNameUtils(
  aggregateAgentVersionRepoName,
);
