import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

/** One Chain has one matching Node Repo; only its durable acknowledgement varies. */
export const agentNodeFanoutDbConfig = makeDbConfig({
  tables: {
    nodeDeliveryAcknowledgement: makeTable({
      name: 'nodeDeliveryAcknowledgement',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        acknowledgedIndex: primitives.integer(),
      },
    }),
  },
});
