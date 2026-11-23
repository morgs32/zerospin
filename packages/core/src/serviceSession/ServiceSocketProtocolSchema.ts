import { PublicFailureSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { EncodedActorServiceCommandSchema } from '../contracts/CommandSchema.ts';

import { ServiceExposedCommandSchema } from './ServiceSessionWireSchema.ts';
export const ServiceNonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
export const ServicePositiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
export const ServiceDispositionChainHashSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);
/** Protocol codecs describe transport; canonical service admission owns domain validation. */
export const ServiceSocketClientMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('resume'),
    nodeId: Schema.NonEmptyString,
    outcomeIndex: ServiceNonNegativeIndexSchema,
    serviceIndex: ServiceNonNegativeIndexSchema,
    dispositionChainHash: ServiceDispositionChainHashSchema,
  }),
  Schema.Struct({
    type: Schema.Literal('pushServiceCommand'),
    command: EncodedActorServiceCommandSchema,
  }),
]);
export const ServiceSocketServerMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('commands'),
    commands: Schema.Array(ServiceExposedCommandSchema).check(
      Schema.isMaxLength(64),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal('replay-complete'),
    serviceIndex: ServiceNonNegativeIndexSchema,
    dispositionChainHash: ServiceDispositionChainHashSchema,
    outcomeIndex: ServiceNonNegativeIndexSchema,
  }),
  Schema.Struct({
    type: Schema.Literal('serviceCommandAdmission'),
    id: makeAbbreviationIdSchema('cmd'),
    pushIndex: ServicePositiveIndexSchema,
  }),
  Schema.Struct({
    type: Schema.Literal('serviceCommandAdmissionFailed'),
    id: makeAbbreviationIdSchema('cmd'),
    failure: PublicFailureSchema,
  }),
  Schema.Struct({
    type: Schema.Literal('state-required'),
    reason: Schema.Literal('checkpoint-conflict'),
    requested: Schema.Struct({
      serviceIndex: ServiceNonNegativeIndexSchema,
      dispositionChainHash: ServiceDispositionChainHashSchema,
    }),
    retainedDispositionChainHash: Schema.NullOr(
      ServiceDispositionChainHashSchema,
    ),
    current: Schema.Struct({
      serviceIndex: ServiceNonNegativeIndexSchema,
      dispositionChainHash: ServiceDispositionChainHashSchema,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal('state-required'),
    reason: Schema.Literals([
      'node-identity-mismatch',
      'node-producer-not-registered',
      'connection-state-invalid',
      'server-failure',
    ]),
  }),
]);
export type IServiceSocketClientMessage =
  typeof ServiceSocketClientMessageSchema.Type;
export type IServiceSocketServerMessage =
  typeof ServiceSocketServerMessageSchema.Type;
