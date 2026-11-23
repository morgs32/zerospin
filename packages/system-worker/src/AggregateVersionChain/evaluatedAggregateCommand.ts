import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { RetainedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { EncodedOperationSchema } from '@zerospin/core/contracts/encodeAppliedOperation';
import type { IAggregateCommand } from '@zerospin/core/contracts/types';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import * as Tuple from 'effect/Tuple';

import { CommandOperationSchema } from '../commandOperations/commandOperation.js';
import { PreparedAggregateExternalOperationSchema } from '../externalOperations/externalOperation.js';

/** Model mutations, frozen command deliveries and external invocations retain one authored order. */
export const EvaluatedAggregateOperationSchema = Schema.Union([
  CommandOperationSchema,
  Schema.Struct(Struct.omit(EncodedOperationSchema.fields, ['commandId'])),
  Schema.Struct({
    ...Struct.omit(PreparedAggregateExternalOperationSchema.fields, [
      'initiatingCommandId',
      'aggregateVersion',
    ]),
    operationName: Schema.Literal('external'),
  }),
]);

export type IEvaluatedAggregateOperation =
  typeof EvaluatedAggregateOperationSchema.Type;

/** Full admitted input and its immutable release-local evaluation. */
export const EvaluatedAggregateCommandSchema =
  RetainedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        aggregateIndex: Schema.Number.check(
          Schema.isInt(),
          Schema.isGreaterThan(0),
        ),
        outcome: CommandOutcomeSchema,
        dispositionChainHash: Schema.String.check(
          Schema.isPattern(/^[a-f0-9]{64}$/u),
        ),
        operations: Schema.Array(EvaluatedAggregateOperationSchema),
      }),
    ),
  ).check(
    Schema.makeFilter(command =>
      command.payload !== null ||
      (command.outcome.result._tag === 'Failure' &&
        command.operations.length === 0)
        ? undefined
        : 'A command with a missing payload must retain a failure with no operations',
    ),
  );

export type IEvaluatedAggregateCommand =
  typeof EvaluatedAggregateCommandSchema.Type;

/** Each delivery retains the complete evaluated command until acknowledged. */
export const evaluatedAggregateCommandShape = {
  aggregateIndex: primitives.integer({ primaryKey: true }),
  id: primitives.text(),
  commandName: primitives.text(),
  payload: primitives.text({ nullable: true }),
  contractVersion: primitives.integer(),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  aggregateVersion: primitives.integer(),
  kind: primitives.enum({ values: ['actor', 'agent', 'system'] }),
  actorName: primitives.text({ nullable: true }),
  actorVersion: primitives.integer({ nullable: true }),
  claims: primitives.json({
    schema: Schema.Record(Schema.String, Schema.Unknown),
    nullable: true,
  }),
  agentName: primitives.text({ nullable: true }),
  agentVersion: primitives.integer({ nullable: true }),
  nodeId: primitives.text({ nullable: true }),
  sessionName: primitives.text({ nullable: true }),
  pushIndex: primitives.integer({ nullable: true }),
  outcome: primitives.json({ schema: CommandOutcomeSchema }),
  dispositionChainHash: primitives.text(),
  operations: primitives.json({
    schema: Schema.Array(EvaluatedAggregateOperationSchema),
  }),
};

/** Store each variant's provenance in scalar columns; non-applicable columns are SQL null. */
export function encodeAggregateCommandProvenance(command: IAggregateCommand) {
  return {
    kind: command.kind,
    actorName: command.kind === 'actor' ? command.actorName : null,
    actorVersion: command.kind === 'actor' ? command.actorVersion : null,
    claims: command.kind === 'actor' ? command.claims : null,
    agentName: command.kind === 'agent' ? command.agentName : null,
    agentVersion: command.kind === 'agent' ? command.agentVersion : null,
    nodeId: command.kind === 'actor' ? command.nodeId : null,
    sessionName: command.kind === 'actor' ? command.sessionName : null,
    pushIndex: command.kind === 'actor' ? command.pushIndex : null,
  };
}

/** Reconstruct one canonical variant and refuse contradictory nullable SQL provenance. */
export function decodeAggregateCommandRow(
  row: Readonly<Record<string, unknown>>,
) {
  const {
    actorName,
    actorVersion,
    claims,
    agentName,
    agentVersion,
    nodeId,
    sessionName,
    pushIndex,
    ...common
  } = row;
  const inactive =
    row.kind === 'actor'
      ? { agentName, agentVersion }
      : row.kind === 'agent'
        ? {
            actorName,
            actorVersion,
            claims,
            nodeId,
            sessionName,
            pushIndex,
          }
        : {
            actorName,
            actorVersion,
            claims,
            agentName,
            agentVersion,
            nodeId,
            sessionName,
            pushIndex,
          };
  const provenance =
    row.kind === 'actor'
      ? {
          actorName,
          actorVersion,
          claims,
          nodeId,
          sessionName,
          pushIndex,
        }
      : row.kind === 'agent'
        ? { agentName, agentVersion }
        : {};
  return Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Null))(
    inactive,
  ).pipe(
    Effect.flatMap(() =>
      Schema.decodeUnknownEffect(Schema.toType(RetainedAggregateCommandSchema))(
        {
          ...common,
          ...provenance,
        },
      ),
    ),
  );
}

/** Decode relational provenance before restoring the complete immutable evaluation. */
export function decodeAggregateEvaluatedCommandRow(
  row: Readonly<Record<string, unknown>>,
) {
  return decodeAggregateCommandRow(row).pipe(
    Effect.flatMap(command =>
      Schema.decodeUnknownEffect(
        Schema.toType(EvaluatedAggregateCommandSchema),
      )({
        ...command,
        aggregateIndex: row.aggregateIndex,
        outcome: row.outcome,
        dispositionChainHash: row.dispositionChainHash,
        operations: row.operations,
      }),
    ),
  );
}
