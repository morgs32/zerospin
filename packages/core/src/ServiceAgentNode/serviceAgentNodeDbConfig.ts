import { makeTable, primitives } from '@zerospin/shapes';

import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';

/** An Agent observer retains only its selected materialization checkpoint. */
export const serviceAgentNodeDbConfig = makeDbConfig({
  tables: {
    nodeMetadata: makeTable({
      name: 'nodeMetadata',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer({ nullable: true }),
        dispositionChainHash: primitives.text({ nullable: true }),
      },
    }),
  },
});
