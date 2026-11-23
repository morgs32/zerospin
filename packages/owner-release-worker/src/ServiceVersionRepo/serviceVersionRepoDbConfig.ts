import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives, type IAnyTables } from '@zerospin/shapes';
import { evaluatedServiceCommandShape } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';

export const serviceVersionRepoDbConfig = makeDbConfig({
  tables: {
    materializationHead: makeTable({
      name: 'materializationHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
    serviceVersionChainOutbox: makeTable({
      name: 'serviceVersionChainOutbox',
      shape: evaluatedServiceCommandShape,
    }),
  } satisfies IAnyTables,
});
