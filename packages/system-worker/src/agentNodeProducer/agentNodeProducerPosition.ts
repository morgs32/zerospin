import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { agentNodeProducerDbConfig } from './agentNodeProducerDbConfig.js';

const table = agentNodeProducerDbConfig.schema.agentNodeProducers;

/** Admission and acknowledgement use this generation check even for repeated positions. */
export const readActiveProducerPosition = Effect.fn(
  'AgentNodeProducer.readActivePosition',
)(function* (tx: Pick<ITx, 'select'>, agentName: string, generation: number) {
  const producer = tx
    .select()
    .from(table)
    .where(eq(table.agentName, agentName))
    .get();
  if (
    producer?.generation !== generation ||
    producer?.lastProducerIndex == null
  ) {
    return yield* makeZerospinError('agent-node-producer-generation-conflict');
  }
  return producer.lastProducerIndex;
});

/** The Chain appends the admitted command and advances this position in one transaction. */
export function acknowledgeAgentNodeCommand(
  tx: ITx,
  agentName: string,
  producerIndex: number,
) {
  tx.update(table)
    .set({ lastProducerIndex: producerIndex })
    .where(eq(table.agentName, agentName))
    .run();
}
