import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable } from '@zerospin/shapes';

import { evaluatedAggregateCommandShape } from '../AggregateVersionChain/evaluatedAggregateCommand.js';

export const aggregateVersionArchiveDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: evaluatedAggregateCommandShape,
    }),
  },
});
