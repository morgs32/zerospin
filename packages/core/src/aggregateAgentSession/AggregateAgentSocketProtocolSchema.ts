import * as Schema from 'effect/Schema';

import {
  AggregateSocketClientMessageSchema,
  AggregateSocketServerMessageSchema,
} from '../aggregateSession/AggregateSocketProtocolSchema.ts';

const resume = AggregateSocketClientMessageSchema.members[0].fields;
const replay = AggregateSocketServerMessageSchema.members[1].fields;

/** Agent browser sockets carry observation checkpoints without producer input or private completion. */
export const AggregateAgentSocketClientMessageSchema = Schema.Struct({
  type: resume.type,
  nodeId: resume.nodeId,
  aggregateIndex: resume.aggregateIndex,
  dispositionChainHash: resume.dispositionChainHash,
});

export const AggregateAgentSocketServerMessageSchema = Schema.Union([
  AggregateSocketServerMessageSchema.members[0],
  Schema.Struct({
    type: replay.type,
    aggregateIndex: replay.aggregateIndex,
    dispositionChainHash: replay.dispositionChainHash,
  }),
  AggregateSocketServerMessageSchema.members[4],
  AggregateSocketServerMessageSchema.members[5],
]);

export type IAggregateAgentSocketClientMessage =
  typeof AggregateAgentSocketClientMessageSchema.Type;
