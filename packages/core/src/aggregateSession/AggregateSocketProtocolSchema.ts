import { PublicFailureSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { EncodedActorAggregateCommandSchema } from '../contracts/CommandSchema.ts';

import { AggregateExposedCommandSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';

const nonNegativeIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const positiveIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
const dispositionChainHash = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

/** Both aggregate socket implementations use this exact client wire contract. */
export const AggregateSocketClientMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('resume'),
    nodeId: Schema.NonEmptyString,
    outcomeIndex: nonNegativeIndex,
    aggregateIndex: nonNegativeIndex,
    dispositionChainHash,
  }),
  Schema.Struct({
    type: Schema.Literal('pushAggregateCommand'),
    command: EncodedActorAggregateCommandSchema,
  }),
]);

/** Public execution progress and the private outcome prefix remain independent. */
export const AggregateSocketServerMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('commands'),
    commands: Schema.Array(AggregateExposedCommandSchema),
  }),
  Schema.Struct({
    type: Schema.Literal('replay-complete'),
    aggregateIndex: nonNegativeIndex,
    dispositionChainHash,
    outcomeIndex: nonNegativeIndex,
  }),
  Schema.Struct({
    type: Schema.Literal('aggregateCommandAdmission'),
    id: makeAbbreviationIdSchema('cmd'),
    pushIndex: positiveIndex,
  }),
  Schema.Struct({
    type: Schema.Literal('aggregateCommandAdmissionFailed'),
    id: makeAbbreviationIdSchema('cmd'),
    failure: PublicFailureSchema,
  }),
  Schema.Struct({
    type: Schema.Literal('state-required'),
    reason: Schema.Literal('checkpoint-conflict'),
    requested: Schema.Struct({
      aggregateIndex: nonNegativeIndex,
      dispositionChainHash,
    }),
    retainedDispositionChainHash: Schema.NullOr(dispositionChainHash),
    current: Schema.Struct({
      aggregateIndex: nonNegativeIndex,
      dispositionChainHash,
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

export type IAggregateSocketClientMessage =
  typeof AggregateSocketClientMessageSchema.Type;
export type IAggregateSocketServerMessage =
  typeof AggregateSocketServerMessageSchema.Type;
