import { CommandContinuationInputSchema } from '@zerospin/core/contracts/buildCommandContinuation';
import {
  EncodedContinuationPayloadSchema,
  FailedContinuationPayloadSchema,
} from '@zerospin/core/contracts/ContinuationPayloadSchema';
import { ExternalContinuationInputSchema } from '@zerospin/core/contracts/externalExecution/buildExternalContinuation';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { PreparedExternalOperationSchema } from '../externalOperations/externalOperation.js';

export const OwnerExternalContinuationSchema = Schema.Struct({
  ...ExternalContinuationInputSchema.fields,
  _tag: Schema.Literal('ExternalContinuation'),
});

export const OwnerExternalRequestSchema = Schema.Struct({
  externalContractName:
    PreparedExternalOperationSchema.fields.externalContractName,
  externalContractVersion:
    PreparedExternalOperationSchema.fields.externalContractVersion,
  payload: PreparedExternalOperationSchema.fields.payload,
});

export const OwnerOperationRequestSchema = Schema.Union([
  OwnerExternalContinuationSchema,
  Schema.Struct({
    ...CommandContinuationInputSchema.fields,
    _tag: Schema.Literal('CommandContinuation'),
  }),
]);

export const ExternalContinuationResponseSchema = Schema.Union([
  EncodedContinuationPayloadSchema,
  FailedContinuationPayloadSchema,
]);

export const CommandContinuationResponseSchema = Schema.NullOr(
  Schema.Union([
    Schema.Struct({
      ...EncodedContinuationPayloadSchema.fields,
      id: makeAbbreviationIdSchema('cmd'),
    }),
    Schema.Struct({
      ...FailedContinuationPayloadSchema.fields,
      id: makeAbbreviationIdSchema('cmd'),
    }),
  ]),
);
