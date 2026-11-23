import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import type { Server } from 'partyserver';

import { aggregateSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';

/** Snapshot surviving sockets before pruning Actor orphans in one synchronous transaction. */
export const reconcileConnectionLocks = makeTx(
  'AggregateActorVersionChain.reconcileConnectionLocks',
)(function* (
  tx: ITx<typeof aggregateSessionChainDbConfig>,
  getConnections: Server['getConnections'],
) {
  const survivingIds = new Set(
    Array.from(getConnections(), connection => connection.id),
  );
  const table = aggregateSessionChainDbConfig.schema.connectionLocks;
  for (const row of tx
    .select({ connectionId: table.connectionId })
    .from(table)
    .all()) {
    if (!survivingIds.has(row.connectionId)) {
      tx.delete(table).where(eq(table.connectionId, row.connectionId)).run();
    }
  }
});
