import { getTableName, sql } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { nodeCommandIdSql } from './nodeCommandIdSql.ts';

/** Keep the outer journal identity qualified when Drizzle renders a single-table selection. */
export function hasNodeCommandFinal(props: {
  journal: SQLiteTable & { id: AnySQLiteColumn; pushIndex: AnySQLiteColumn };
  nodeId: string;
  finalIndex: AnySQLiteColumn;
}) {
  const { journal, finalIndex, nodeId } = props;
  const journalName = getTableName(journal);
  return sql<boolean>`EXISTS (
    SELECT 1 FROM ${sql.identifier(journalName)} AS executed
    WHERE executed.${sql.identifier(journal.id.name)} = ${nodeCommandIdSql(nodeId, journal)}
      AND executed.${sql.identifier(finalIndex.name)} IS NOT NULL
  )`;
}
