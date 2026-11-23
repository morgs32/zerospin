import * as Schema from 'effect/Schema';

import { isAggregateAgentRelease } from './makeAggregateAgentRelease.ts';

export const AggregateAgentReleaseSchema = Schema.declare(
  isAggregateAgentRelease,
);
