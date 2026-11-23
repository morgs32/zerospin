import { max } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  aggregateNodeTables,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';

/** Retained append and original producer positions prove each generation's allocated maxima. */
export async function readAggregateNodeIndexes(
  db: SqliteRemoteDatabase,
  nodeTables: IAggregateNodeTables = aggregateNodeTables,
) {
  const aggregateNodeCommands = nodeTables.commands;
  const [indexes] = await db
    .select({
      nodeIndex: max(aggregateNodeCommands.nodeIndex),
      pushIndex: max(aggregateNodeCommands.pushIndex),
    })
    .from(aggregateNodeCommands);
  return {
    nodeIndex: indexes?.nodeIndex ?? 0,
    pushIndex: indexes?.pushIndex ?? 0,
  };
}
