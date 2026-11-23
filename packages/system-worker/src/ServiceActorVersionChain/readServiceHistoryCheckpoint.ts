import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';

import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Local immutable checkpoint reader used by the Service Agent history. */
export function readServiceHistoryCheckpoint(db: IDb, serviceIndex?: number) {
  if (
    serviceIndex !== undefined &&
    (!Number.isSafeInteger(serviceIndex) || serviceIndex < 0)
  ) {
    throw makeZerospinError('service-projection-checkpoint-invalid');
  }
  if (serviceIndex === 0) {
    return {
      serviceIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    };
  }
  const table = serviceActorVersionChainDbConfig.schema.exposedCommands;
  const row = db
    .select({
      serviceIndex: table.serviceIndex,
      dispositionChainHash: table.dispositionChainHash,
    })
    .from(table)
    .where(
      serviceIndex === undefined
        ? undefined
        : eq(table.serviceIndex, serviceIndex),
    )
    .orderBy(desc(table.serviceIndex))
    .limit(1)
    .get();
  if (row === undefined) {
    if (serviceIndex !== undefined) {
      throw makeZerospinError('service-projection-checkpoint-invalid');
    }
    return {
      serviceIndex: 0,
      dispositionChainHash: genesisDispositionChainHash(),
    };
  }
  if (
    !Number.isSafeInteger(row.serviceIndex) ||
    row.serviceIndex < 1 ||
    !/^[a-f0-9]{64}$/u.test(row.dispositionChainHash)
  ) {
    throw makeZerospinError('service-projection-checkpoint-invalid');
  }
  return row;
}
