import { SystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

import { aggregateChainName } from '../AggregateChain/aggregateChainName.js';

export const AggregateReplayAdapterRequestSchema = Schema.Struct({
  ...aggregateChainName.keyCodec.fields,
  aggregateIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  commandId: SystemAggregateCommandSchema.fields.id,
  receivingAggregateVersion: VersionSchema,
});

export type IAggregateReplayAdapterRequest =
  typeof AggregateReplayAdapterRequestSchema.Type;
