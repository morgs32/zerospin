import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

import { agentNodeProducerDbConfig } from './agentNodeProducerDbConfig.js';

export const AgentNodeGenerationSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
const AgentNodeProducerTransitionSchema = Schema.Struct({
  agentName: Schema.NonEmptyString,
  generation: AgentNodeGenerationSchema,
  active: Schema.Boolean,
});

export type IAgentNodeProducerTransition =
  typeof AgentNodeProducerTransitionSchema.Type;

/** Repeating the same transition preserves every command admitted since it committed. */
export const transitionAgentNodeProducerTx = makeTx(
  'AgentNodeProducer.transition',
)(function* (tx: ITx, input: IAgentNodeProducerTransition) {
  const { agentName, generation, active } = yield* Schema.decodeUnknownEffect(
    AgentNodeProducerTransitionSchema,
  )(input, { onExcessProperty: 'error' });
  const table = agentNodeProducerDbConfig.schema.agentNodeProducers;
  const previous = tx
    .select()
    .from(table)
    .where(eq(table.agentName, agentName))
    .get();
  if (previous !== undefined && previous.generation >= generation) {
    if (
      previous.generation === generation &&
      (previous.lastProducerIndex !== null) === active
    ) {
      return;
    }
    return yield* makeZerospinError('agent-node-producer-generation-conflict');
  }
  const state = { generation, lastProducerIndex: active ? 0 : null };
  tx.insert(table)
    .values({ agentName, ...state })
    .onConflictDoUpdate({
      target: table.agentName,
      set: state,
    })
    .run();
});
