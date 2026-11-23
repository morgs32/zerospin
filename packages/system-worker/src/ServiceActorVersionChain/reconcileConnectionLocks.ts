import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import type { Server } from 'partyserver';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Complete socket enumeration before pruning absent connection rows in one synchronous transaction. */
export const reconcileConnectionLocks = makeTx(
  'ServiceActorVersionChain.reconcileConnectionLocks',
)(function* (
  tx: ITx<typeof serviceActorVersionChainDbConfig>,
  getConnections: Server['getConnections'],
) {
  const survivingIds = new Set(
    Array.from(getConnections(), connection => connection.id),
  );
  const table = serviceActorVersionChainDbConfig.schema.connectionLocks;
  for (const row of tx
    .select({ connectionId: table.connectionId })
    .from(table)
    .all()) {
    if (!survivingIds.has(row.connectionId)) {
      tx.delete(table).where(eq(table.connectionId, row.connectionId)).run();
    }
  }
});
