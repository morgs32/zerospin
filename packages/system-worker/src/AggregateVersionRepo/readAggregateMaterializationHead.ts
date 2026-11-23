import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';

import { genesisDispositionChainHash } from '../aggregateDispositionChainHash/aggregateDispositionChainHash.js';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';

/** Current materialized resource progress has one compact singleton row. */
export function readAggregateMaterializationHead(db: IDb) {
  const { materializationHead } = aggregateVersionRepoDbConfig.schema;
  return (
    db
      .select({
        aggregateIndex: materializationHead.aggregateIndex,
        dispositionChainHash: materializationHead.dispositionChainHash,
      })
      .from(materializationHead)
      .where(eq(materializationHead.singletonId, 1))
      .get() ?? {
      aggregateIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    }
  );
}
