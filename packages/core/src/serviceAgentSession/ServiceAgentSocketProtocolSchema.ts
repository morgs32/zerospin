import * as Schema from 'effect/Schema';

import {
  ServiceSocketClientMessageSchema,
  ServiceSocketServerMessageSchema,
} from '../serviceSession/ServiceSocketProtocolSchema.ts';

const resume = ServiceSocketClientMessageSchema.members[0].fields;
const replay = ServiceSocketServerMessageSchema.members[1].fields;

/** Agent browser sockets carry observation checkpoints without producer input or private completion. */
export const ServiceAgentSocketClientMessageSchema = Schema.Struct({
  type: resume.type,
  nodeId: resume.nodeId,
  serviceIndex: resume.serviceIndex,
  dispositionChainHash: resume.dispositionChainHash,
});

export const ServiceAgentSocketServerMessageSchema = Schema.Union([
  ServiceSocketServerMessageSchema.members[0],
  Schema.Struct({
    type: replay.type,
    serviceIndex: replay.serviceIndex,
    dispositionChainHash: replay.dispositionChainHash,
  }),
  ServiceSocketServerMessageSchema.members[4],
  ServiceSocketServerMessageSchema.members[5],
]);

export type IServiceAgentSocketClientMessage =
  typeof ServiceAgentSocketClientMessageSchema.Type;
