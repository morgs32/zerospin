import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

/** A stopped installation retains its generation with no active producer position. */
export const agentNodeProducerDbConfig = makeDbConfig({
  tables: {
    agentNodeProducers: makeTable({
      name: 'agentNodeProducers',
      shape: {
        agentName: primitives.text({ primaryKey: true }),
        generation: primitives.integer(),
        lastProducerIndex: primitives.integer({ nullable: true }),
      },
    }),
  },
});
