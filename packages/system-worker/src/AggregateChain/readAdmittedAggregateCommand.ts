import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeAggregateCommandRow } from '../AggregateVersionChain/evaluatedAggregateCommand.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import type { IAdmittedAggregateCommand } from './types.js';

/** Decode retained facts and restore the owner from the bound Chain. */
export function readAdmittedAggregateCommand(
  row: typeof aggregateChainDbConfig.schema.commands.$inferSelect,
  key: { aggregateId: string; aggregateName: string },
): IAdmittedAggregateCommand {
  const decodedCommandRow = Schema.decodeUnknownSync(
    aggregateChainDbConfig.tables.commands.codec,
  )(row);
  const command = Effect.runSync(
    decodeAggregateCommandRow({
      ...decodedCommandRow,
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
    }),
  );
  return {
    ...command,
    aggregateIndex: decodedCommandRow.aggregateIndex,
    outcome: decodedCommandRow.outcome,
    ...(decodedCommandRow.payloadFailure === null
      ? {}
      : { payloadFailure: decodedCommandRow.payloadFailure }),
  };
}
