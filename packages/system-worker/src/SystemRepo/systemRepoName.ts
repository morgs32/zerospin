import { RoutePattern } from '@remix-run/route-pattern';
import * as Schema from 'effect/Schema';

import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

/** The singleton SystemRepo is addressed by the exact deployment systemId. */
export const systemRepoName = {
  abbreviation: undefined,
  keyCodec: Schema.Struct({
    systemId: Schema.String,
  }),
  namePattern: RoutePattern.parse('/:systemId'),
};

export const systemRepoNameUtils = makeRepoNameUtils(systemRepoName);
