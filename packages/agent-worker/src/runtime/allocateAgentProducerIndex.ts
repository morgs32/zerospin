import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { agentNodeRepoDbConfig } from '@zerospin/system-worker/agentNodeRepo/agentNodeRepoDbConfig';

/** Allocate the next position in the current Agent installation with its pending command. */
export function allocateAgentProducerIndex(tx: ITx) {
  const { producerPosition } = agentNodeRepoDbConfig.schema;
  const nextIndex =
    (tx.select().from(producerPosition).get()?.lastIndex ?? 0) + 1;
  if (!Number.isSafeInteger(nextIndex)) {
    throw makeZerospinError('agent-producer-index-exhausted');
  }
  tx.insert(producerPosition)
    .values({ singletonId: 1, lastIndex: nextIndex })
    .onConflictDoUpdate({
      target: producerPosition.singletonId,
      set: { lastIndex: nextIndex },
    })
    .run();
  return nextIndex;
}
