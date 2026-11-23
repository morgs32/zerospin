import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

import {
  EncodedSystemAggregateCommandSchema,
  EncodedSystemServiceCommandSchema,
} from './CommandSchema.ts';

export const CommandOperationDeclarationSchema = Schema.Struct({
  commandName: Schema.NonEmptyString,
  extension: Schema.optionalKey(Schema.Literal(true)),
});

const continuation = Schema.optionalKey(
  Schema.Struct({
    id: makeAbbreviationIdSchema('cmd'),
    ownerVersion: VersionSchema,
    declaration: CommandOperationDeclarationSchema.mapFields(fields => ({
      ...fields,
      operationKey: Schema.String,
    })),
  }),
);

/** Complete immutable ordinary System commands frozen by original source execution. */
export const RecordedCommandSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('aggregate'),
    command: EncodedSystemAggregateCommandSchema,
    continuation,
  }),
  Schema.Struct({
    type: Schema.Literal('service'),
    command: EncodedSystemServiceCommandSchema,
    continuation,
  }),
]);
export type IRecordedCommand = typeof RecordedCommandSchema.Type;
