import { RecordedCommandSchema } from '@zerospin/core/contracts/RecordedCommandSchema';
import * as Schema from 'effect/Schema';

/** Original execution freezes the complete destination input in authored order. */
export const CommandOperationSchema = Schema.Struct({
  operationName: Schema.Literal('command'),
  operationIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  command: RecordedCommandSchema,
});
