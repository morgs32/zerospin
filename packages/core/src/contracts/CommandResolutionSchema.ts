import { PublicFailureSchema } from '@zerospin/error';
import * as Schema from 'effect/Schema';

/** The complete private recipient and result owned by one actor publication. */
export const CommandResolutionSchema = Schema.Struct({
  nodeId: Schema.NonEmptyString,
  pushIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  sessionName: Schema.NonEmptyString,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  failure: Schema.NullOr(PublicFailureSchema),
});
export type ICommandResolution = Schema.Schema.Type<
  typeof CommandResolutionSchema
>;
