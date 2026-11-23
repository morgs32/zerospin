import { max } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  serviceNodeTables,
  type IServiceNodeTables,
} from './serviceNodeTables.ts';

/** Retained append and original producer positions prove each generation's allocated maxima. */
export async function readServiceNodeIndexes(
  db: SqliteRemoteDatabase,
  nodeTables: IServiceNodeTables = serviceNodeTables,
) {
  const serviceNodeCommands = nodeTables.commands;
  const [indexes] = await db
    .select({
      nodeIndex: max(serviceNodeCommands.nodeIndex),
      pushIndex: max(serviceNodeCommands.pushIndex),
    })
    .from(serviceNodeCommands);
  return {
    nodeIndex: indexes?.nodeIndex ?? 0,
    pushIndex: indexes?.pushIndex ?? 0,
  };
}
