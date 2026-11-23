import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Record Aggregate catalogue membership without changing physical Repo metadata. */
export const registerAggregate = makeTx('SystemRepo.registerAggregate')(
  function* (
    tx: ITx<typeof systemRepoDbConfig>,
    props: { aggregateName: string; aggregateId: IAggregateId },
  ) {
    const { aggregateName, aggregateId } = props;
    tx.insert(systemRepoDbConfig.schema.aggregates)
      .values({ aggregateName, aggregateId })
      .onConflictDoNothing()
      .run();
  },
);
