import { makeZerospinError } from '@zerospin/error';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  serviceNodeTables,
  type IServiceNodeTables,
} from './serviceNodeTables.ts';

/** Require one producer row and either no baseline or one complete valid checkpoint. */
export async function readServiceNodeMetadata(
  db: SqliteRemoteDatabase,
  nodeTables: IServiceNodeTables = serviceNodeTables,
) {
  const serviceNodeMetadata = nodeTables.metadata;
  const rows = await db.select().from(serviceNodeMetadata).limit(2);
  if (rows.length > 1) throw makeZerospinError('node-metadata-ambiguous');
  const metadata = rows[0];
  if (metadata === undefined) throw makeZerospinError('node-metadata-missing');
  if (
    !(
      (metadata.serviceIndex === null &&
        metadata.dispositionChainHash === null) ||
      (metadata.serviceIndex !== null &&
        metadata.dispositionChainHash !== null &&
        Number.isSafeInteger(metadata.serviceIndex) &&
        metadata.serviceIndex >= 0 &&
        /^[a-f0-9]{64}$/u.test(metadata.dispositionChainHash))
    )
  ) {
    throw makeZerospinError('node-execution-checkpoint-invalid');
  }
  return metadata;
}
