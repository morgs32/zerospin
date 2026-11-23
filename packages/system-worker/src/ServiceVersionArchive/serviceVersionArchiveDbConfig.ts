import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable } from '@zerospin/shapes';

import { evaluatedServiceCommandShape } from '../ServiceVersionChain/evaluatedServiceCommand.js';

export const serviceVersionArchiveDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: evaluatedServiceCommandShape,
    }),
  },
});
