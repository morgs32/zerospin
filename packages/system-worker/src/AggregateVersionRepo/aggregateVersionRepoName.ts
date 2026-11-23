import { RoutePattern } from '@remix-run/route-pattern';
import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

/** Physical AggregateVersionRepo identity shared by lookup and inspection. */
export const aggregateVersionRepoName = {
  abbreviation: systemWorkerAbbreviations.aggregateVersionRepo,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: VersionFromStringSchema,
  }),
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
};

export const aggregateVersionRepoNameUtils = makeRepoNameUtils(
  aggregateVersionRepoName,
);
