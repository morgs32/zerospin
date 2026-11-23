import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

const identity = {
  modelName: Schema.String,
  modelVersion: VersionSchema,
  resourceId: Schema.String,
};

/** Only the state needed to undo currently applied optimism. */
export const InverseOperationSchema = Schema.Union([
  Schema.Struct({
    ...identity,
    operationName: Schema.Literal('create'),
  }),
  Schema.Struct({
    ...identity,
    operationName: Schema.Literal('update'),
    inverseOperation: Schema.String,
    previousUpdatedAt: Schema.DateFromString,
  }),
  Schema.Struct({
    ...identity,
    operationName: Schema.Literal('delete'),
    inverseOperation: Schema.String,
  }),
  Schema.Struct({
    ...identity,
    operationName: Schema.Literal('move'),
    inverseOperation: Schema.String,
    previousUpdatedAt: Schema.DateFromString,
  }),
]);

export type IInverseOperation = typeof InverseOperationSchema.Type;
