import type { IDb } from '@zerospin/core/drizzle/types';
import { genesisDispositionChainHash } from '@zerospin/system-worker/serviceDispositionChainHash/serviceDispositionChainHash';
import { eq } from 'drizzle-orm';

import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';

/** Current materialized resource progress has one compact singleton row. */
export function readServiceMaterializationHead(db: IDb) {
  const { materializationHead } = serviceVersionRepoDbConfig.schema;
  return (
    db
      .select({
        serviceIndex: materializationHead.serviceIndex,
        dispositionChainHash: materializationHead.dispositionChainHash,
      })
      .from(materializationHead)
      .where(eq(materializationHead.singletonId, 1))
      .get() ?? {
      serviceIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    }
  );
}
