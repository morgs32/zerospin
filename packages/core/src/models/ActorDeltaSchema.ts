/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import * as Schema from 'effect/Schema';

import { RefSchema } from '../aggregateSession/AggregateActorCommandSchema/ResourceSchema/ResourceSchema.ts';
import type { IActorDelta } from '../aggregateSession/types.ts';

import { ResourceEnvelopeJsonCodec } from './ResourceEnvelopeJsonCodec.ts';
export const ActorDeltaSchema: Schema.Codec<IActorDelta, any> = Schema.Struct({
  upserted: Schema.Array(ResourceEnvelopeJsonCodec),
  deleted: Schema.Array(RefSchema),
});
