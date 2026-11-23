import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeServiceCommandRow } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

/** Decode retained facts and restore the owner from the bound Chain. */
export function readServiceCommandOccurrence(
  row: typeof serviceChainDbConfig.schema.commands.$inferSelect,
  key: { serviceName: string },
): IServiceCommandOccurrence {
  const decodedCommandRow = Schema.decodeUnknownSync(
    serviceChainDbConfig.tables.commands.codec,
  )(row);
  const command = Effect.runSync(
    decodeServiceCommandRow({
      ...decodedCommandRow,
      serviceName: key.serviceName,
    }),
  );
  return {
    ...command,
    serviceIndex: decodedCommandRow.serviceIndex,
    outcome: decodedCommandRow.outcome,
    ...(decodedCommandRow.payloadFailure === null
      ? {}
      : { payloadFailure: decodedCommandRow.payloadFailure }),
  };
}
