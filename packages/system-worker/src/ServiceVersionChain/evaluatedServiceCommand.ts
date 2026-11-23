import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { RetainedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { EncodedOperationSchema } from '@zerospin/core/contracts/encodeAppliedOperation';
import type { IServiceCommand } from '@zerospin/core/contracts/types';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import * as Tuple from 'effect/Tuple';

import { CommandOperationSchema } from '../commandOperations/commandOperation.js';
import { PreparedServiceExternalOperationSchema } from '../externalOperations/externalOperation.js';

/** One authored order for model mutations, frozen commands and external descriptions. */
export const EvaluatedServiceOperationSchema = Schema.Union([
  CommandOperationSchema,
  Schema.Struct(Struct.omit(EncodedOperationSchema.fields, ['commandId'])),
  Schema.Struct({
    ...Struct.omit(PreparedServiceExternalOperationSchema.fields, [
      'initiatingCommandId',
      'serviceVersion',
    ]),
    operationName: Schema.Literal('external'),
  }),
]);

export type IEvaluatedServiceOperation =
  typeof EvaluatedServiceOperationSchema.Type;

/** Full admitted input and its immutable release-local evaluation. */
export const EvaluatedServiceCommandSchema =
  RetainedServiceCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        serviceIndex: Schema.Number.check(
          Schema.isInt(),
          Schema.isGreaterThan(0),
        ),
        outcome: CommandOutcomeSchema,
        dispositionChainHash: Schema.String.check(
          Schema.isPattern(/^[a-f0-9]{64}$/u),
        ),
        operations: Schema.Array(EvaluatedServiceOperationSchema),
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

export type IEvaluatedServiceCommand =
  typeof EvaluatedServiceCommandSchema.Type;

/** Each delivery retains the complete evaluated command until acknowledged. */
export const evaluatedServiceCommandShape = {
  serviceIndex: primitives.integer({ primaryKey: true }),
  id: primitives.text(),
  commandName: primitives.text(),
  payload: primitives.text({ nullable: true }),
  contractVersion: primitives.integer(),
  serviceName: primitives.text(),
  serviceVersion: primitives.integer(),
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
    schema: Schema.Array(EvaluatedServiceOperationSchema),
  }),
};

export type IServiceCommandCheckpoint = {
  serviceIndex: number;
  id: string | null;
  dispositionChainHash: string;
};

/** Store each variant's provenance in scalar columns; non-applicable columns are SQL null. */
export function encodeServiceCommandProvenance(command: IServiceCommand) {
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
export function decodeServiceCommandRow(
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
      Schema.decodeUnknownEffect(Schema.toType(RetainedServiceCommandSchema))({
        ...common,
        ...provenance,
      }),
    ),
  );
}

/** Decode relational provenance before restoring the complete immutable evaluation. */
export function decodeServiceEvaluatedCommandRow(
  row: Readonly<Record<string, unknown>>,
) {
  return decodeServiceCommandRow(row).pipe(
    Effect.flatMap(command =>
      Schema.decodeUnknownEffect(Schema.toType(EvaluatedServiceCommandSchema))({
        ...command,
        serviceIndex: row.serviceIndex,
        outcome: row.outcome,
        dispositionChainHash: row.dispositionChainHash,
        operations: row.operations,
      }),
    ),
  );
}
