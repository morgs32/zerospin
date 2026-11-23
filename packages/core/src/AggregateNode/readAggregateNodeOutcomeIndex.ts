import { isNotNull } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { hasNodeCommandFinal } from '../Node/hasNodeCommandFinal.ts';

import {
  aggregateNodeTables,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';
import { readAggregateNodeMetadata } from './readAggregateNodeMetadata.ts';

/** Only a contiguous original producer prefix with matching retained finals is resolved. */
export async function readAggregateNodeOutcomeIndex(
  db: SqliteRemoteDatabase,
  nodeTables: IAggregateNodeTables = aggregateNodeTables,
) {
  const aggregateNodeCommands = nodeTables.commands;
  const submissions = await db
    .select({
      pushIndex: aggregateNodeCommands.pushIndex,
      completed: hasNodeCommandFinal({
        nodeId: (await readAggregateNodeMetadata(db, nodeTables)).nodeId,
        journal: aggregateNodeCommands,
        finalIndex: aggregateNodeCommands.aggregateIndex,
      }),
    })
    .from(aggregateNodeCommands)
    .where(isNotNull(aggregateNodeCommands.pushIndex))
    .orderBy(aggregateNodeCommands.pushIndex);
  let outcomeIndex = 0;
  for (const submission of submissions) {
    if (submission.pushIndex !== outcomeIndex + 1 || !submission.completed) {
      break;
    }
    outcomeIndex = submission.pushIndex;
  }
  return outcomeIndex;
}
