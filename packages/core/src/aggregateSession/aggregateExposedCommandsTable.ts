import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import { AggregateExposedCommandSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateExposedCommand } from './types.ts';

/** Public retained commands have no private recipient or result columns. */
export const aggregateExposedCommandsTable = makeTable({
  name: 'exposedCommands',
  shape: {
    aggregateIndex: primitives.integer({ primaryKey: true }),
    dispositionChainHash: primitives.text(),
    id: primitives.text(),
    commandName: primitives.text(),
    delta: primitives.json({ schema: ActorDeltaSchema }),
  },
  indexes: [{ name: 'exposedCommands_id', columns: ['id'], unique: true }],
});

export function makeAggregateExposedCommand(
  row: typeof aggregateExposedCommandsTable.codec.Type & {
    failure: IAggregateExposedCommand['failure'];
  },
): IAggregateExposedCommand {
  return Schema.decodeUnknownSync(Schema.toType(AggregateExposedCommandSchema))(
    {
      aggregateIndex: row.aggregateIndex,
      dispositionChainHash: row.dispositionChainHash,
      id: row.id,
      commandName: row.commandName,
      delta: row.delta,
      failure: row.failure,
    },
  );
}
