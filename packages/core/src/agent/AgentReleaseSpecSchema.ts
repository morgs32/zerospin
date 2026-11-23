import * as Schema from 'effect/Schema';

import { AgentReleaseSpecFields } from '../declaration/ReleaseSpecSchemas.ts';

/** Owner context belongs to the enclosing Aggregate or Service release. */
export const AgentReleaseSpecSchema = Schema.Struct(AgentReleaseSpecFields);
export type IAgentReleaseSpec = typeof AgentReleaseSpecSchema.Type;
