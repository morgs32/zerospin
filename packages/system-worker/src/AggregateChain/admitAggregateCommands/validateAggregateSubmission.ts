import { EncodedActorAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { mapParseError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

/** Decode the entire bound ordinary submission before transactional command decisions. */
export function validateAggregateSubmission(
  commands: readonly unknown[],
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  },
) {
  const commandSchema = EncodedActorAggregateCommandSchema.check(
    Schema.makeFilter(
      command =>
        command.aggregateId === key.aggregateId || {
          path: ['aggregateId'],
          issue: 'Command does not match the bound aggregate ID',
        },
    ),
    Schema.makeFilter(
      command =>
        command.aggregateName === key.aggregateName || {
          path: ['aggregateName'],
          issue: 'Command does not match the bound aggregate name',
        },
    ),
  );
  return Schema.decodeUnknownEffect(Schema.Array(commandSchema))(commands, {
    concurrency: 1,
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-chain-command-invalid',
      prefix: 'Invalid aggregate input',
    }),
  );
}
