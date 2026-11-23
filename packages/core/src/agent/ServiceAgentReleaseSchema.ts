import * as Schema from 'effect/Schema';

import { isServiceAgentRelease } from './makeServiceAgentRelease.ts';

export const ServiceAgentReleaseSchema = Schema.declare(isServiceAgentRelease);
