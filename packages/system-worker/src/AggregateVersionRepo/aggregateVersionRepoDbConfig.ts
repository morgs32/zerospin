import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives, type IAnyTables } from '@zerospin/shapes';

import { evaluatedAggregateCommandShape } from '../AggregateVersionChain/evaluatedAggregateCommand.js';

export const aggregateVersionRepoDbConfig = makeDbConfig({
  tables: {
    materializationHead: makeTable({
      name: 'materializationHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
    aggregateVersionChainOutbox: makeTable({
      name: 'aggregateVersionChainOutbox',
      shape: evaluatedAggregateCommandShape,
    }),
  } satisfies IAnyTables,
});
