import { makeZerospinError } from '@zerospin/error';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  aggregateNodeTables,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';

/** Require one producer row and either no baseline or one complete valid checkpoint. */
export async function readAggregateNodeMetadata(
  db: SqliteRemoteDatabase,
  nodeTables: IAggregateNodeTables = aggregateNodeTables,
) {
  const aggregateNodeMetadata = nodeTables.metadata;
  const rows = await db.select().from(aggregateNodeMetadata).limit(2);
  if (rows.length > 1) throw makeZerospinError('node-metadata-ambiguous');
  const metadata = rows[0];
  if (metadata === undefined) throw makeZerospinError('node-metadata-missing');
  if (
    !(
      (metadata.aggregateIndex === null &&
        metadata.dispositionChainHash === null) ||
      (metadata.aggregateIndex !== null &&
        metadata.dispositionChainHash !== null &&
        Number.isSafeInteger(metadata.aggregateIndex) &&
        metadata.aggregateIndex >= 0 &&
        /^[a-f0-9]{64}$/u.test(metadata.dispositionChainHash))
    )
  ) {
    throw makeZerospinError('node-execution-checkpoint-invalid');
  }
  return metadata;
}
