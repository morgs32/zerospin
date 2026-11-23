import { isNotNull } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { hasNodeCommandFinal } from '../Node/hasNodeCommandFinal.ts';

import { readServiceNodeMetadata } from './readServiceNodeMetadata.ts';
import {
  serviceNodeTables,
  type IServiceNodeTables,
} from './serviceNodeTables.ts';

/** Only a contiguous original producer prefix with matching retained finals is resolved. */
export async function readServiceNodeOutcomeIndex(
  db: SqliteRemoteDatabase,
  nodeTables: IServiceNodeTables = serviceNodeTables,
) {
  const serviceNodeCommands = nodeTables.commands;
  const submissions = await db
    .select({
      pushIndex: serviceNodeCommands.pushIndex,
      completed: hasNodeCommandFinal({
        nodeId: (await readServiceNodeMetadata(db, nodeTables)).nodeId,
        journal: serviceNodeCommands,
        finalIndex: serviceNodeCommands.serviceIndex,
      }),
    })
    .from(serviceNodeCommands)
    .where(isNotNull(serviceNodeCommands.pushIndex))
    .orderBy(serviceNodeCommands.pushIndex);
  let outcomeIndex = 0;
  for (const submission of submissions) {
    if (submission.pushIndex !== outcomeIndex + 1 || !submission.completed) {
      break;
    }
    outcomeIndex = submission.pushIndex;
  }
  return outcomeIndex;
}
