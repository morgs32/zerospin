import { makeTable, primitives } from '@zerospin/shapes';

import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';

/** An Agent observer retains only its selected materialization checkpoint. */
export const aggregateAgentNodeDbConfig = makeDbConfig({
  tables: {
    nodeMetadata: makeTable({
      name: 'nodeMetadata',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer({ nullable: true }),
        dispositionChainHash: primitives.text({ nullable: true }),
      },
    }),
  },
});
