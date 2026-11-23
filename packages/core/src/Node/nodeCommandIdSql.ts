import { getTableName, sql } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { makeNodeCommandId } from '../contracts/commandIds.ts';

/** Match retained finals to original producer coordinates without storing a copied ID. */
export function nodeCommandIdSql(
  nodeId: string,
  journal: SQLiteTable & { pushIndex: AnySQLiteColumn },
) {
  const prefix = makeNodeCommandId(nodeId, 0).slice(0, -4);
  return sql<string>`${prefix} || ${sql.identifier(getTableName(journal))}.${sql.identifier(journal.pushIndex.name)} || '%5D'`;
}
