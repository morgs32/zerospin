import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

/** Prepared descriptions retain source lineage; each Chain defines its own pending row. */
export const PreparedExternalOperationSchema = Schema.Struct({
  initiatingCommandId: Schema.String,
  operationIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  externalContractName: Schema.String,
  externalContractVersion: VersionSchema,
  payload: Schema.Json,
  externalCommandId: makeAbbreviationIdSchema('cmd'),
});
export type IPreparedExternalOperation =
  typeof PreparedExternalOperationSchema.Type;
export const PreparedAggregateExternalOperationSchema = Schema.Struct({
  ...PreparedExternalOperationSchema.fields,
  aggregateVersion: VersionSchema,
});
export type IPreparedAggregateExternalOperation =
  typeof PreparedAggregateExternalOperationSchema.Type;
export const PreparedServiceExternalOperationSchema = Schema.Struct({
  ...PreparedExternalOperationSchema.fields,
  serviceVersion: VersionSchema,
});
export type IPreparedServiceExternalOperation =
  typeof PreparedServiceExternalOperationSchema.Type;
