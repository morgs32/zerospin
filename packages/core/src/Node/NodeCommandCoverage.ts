import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { ActorCommandSchema } from '../contracts/CommandSchema.ts';

export const NodeRetentionSchema = Schema.Struct({
  sessionId: makeAbbreviationIdSchema('sesn'),
  sessionIndex: ActorCommandSchema.fields.pushIndex,
  nodeId: ActorCommandSchema.fields.nodeId,
  nodeIndex: ActorCommandSchema.fields.pushIndex,
  pushIndex: ActorCommandSchema.fields.pushIndex,
});
export type INodeRetention = typeof NodeRetentionSchema.Type;

/** Allocation fields are either unknown to this holder or known together. */
export const NodeCommandAllocationSchema = Schema.Union([
  Schema.Struct({
    id: Schema.Null,
    nodeId: Schema.Null,
    nodeIndex: Schema.Null,
    pushIndex: Schema.Null,
  }),
  Schema.Struct({
    id: ActorCommandSchema.fields.id,
    nodeId: NodeRetentionSchema.fields.nodeId,
    nodeIndex: NodeRetentionSchema.fields.nodeIndex,
    pushIndex: NodeRetentionSchema.fields.pushIndex,
  }),
]);

/** Missing retention cannot carry final resolution evidence. */
export const makeNodeCommandCoverageSchema = <RESOLUTION extends Schema.Top>(
  resolution: RESOLUTION,
) => {
  const fields = {
    sessionId: NodeRetentionSchema.fields.sessionId,
    sessionIndex: NodeRetentionSchema.fields.sessionIndex,
    commandName: ActorCommandSchema.fields.commandName,
  };
  return Schema.Union([
    Schema.Struct({
      ...fields,
      nodeId: Schema.Null,
      nodeIndex: Schema.Null,
      pushIndex: Schema.Null,
      resolution: Schema.Null,
    }),
    Schema.Struct({
      ...fields,
      nodeId: NodeRetentionSchema.fields.nodeId,
      nodeIndex: NodeRetentionSchema.fields.nodeIndex,
      pushIndex: NodeRetentionSchema.fields.pushIndex,
      resolution: Schema.NullOr(resolution),
    }),
  ]);
};
export type INodeCommandCoverage<RESOLUTION> = ReturnType<
  typeof makeNodeCommandCoverageSchema<Schema.Schema<RESOLUTION>>
>['Type'];
