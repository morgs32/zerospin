import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';

import { AggregateSessionSnapshotSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import { AgentOriginSchema } from '../contracts/OriginSchema.ts';

/** An Agent observer receives selected resources and their matching public checkpoint. */
export const AggregateAgentSessionSnapshotSchema = Schema.Struct({
  ...Struct.omit(AggregateSessionSnapshotSchema.fields, [
    'actorName',
    'actorVersion',
    'claims',
    'resolvedThrough',
  ]),
  origin: AgentOriginSchema,
});

export type IAggregateAgentSessionSnapshot =
  typeof AggregateAgentSessionSnapshotSchema.Type;
