import { ensureZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  quoteSqliteIdentifier,
  type ISqliteTableDefinition,
} from '../drizzle/definition/compileSqliteTableDefinition.ts';
import { isApplicationSchemaObject } from '../drizzle/provisionDb/validateDbSchema.ts';
import {
  validateTableSchemaMetadata,
  type ITableSchemaMetadata,
} from '../drizzle/provisionDb/validateTableSchema.ts';

/** Read async SQLite metadata, then use the same physical-table rules as sync owners. */
export async function validateNodeStorageSchema(
  db: SqliteRemoteDatabase,
  tables: readonly ISqliteTableDefinition[],
  options?: { allowOtherTables?: boolean },
): Promise<void> {
  try {
    const objects = (
      await db.all<{ name: string; type: string }>(
        sql`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view', 'trigger')`,
      )
    ).filter(isApplicationSchemaObject);
    if (objects.some(object => object.type !== 'table')) {
      throw new Error('Node schema contains an unsupported view or trigger');
    }
    const expected = tables.map(table => table.name).sort();
    if (
      new Set(expected).size !== expected.length ||
      (options?.allowOtherTables !== true &&
        JSON.stringify(objects.map(object => object.name).sort()) !==
          JSON.stringify(expected))
    ) {
      throw new Error('Node schema tables differ from their declaration');
    }
    for (const table of tables) {
      const [retained] = await db.all<{ sql: string }>(
        sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${table.name}`,
      );
      const columns = await db.all<ITableSchemaMetadata['columns'][number]>(
        sql.raw(`PRAGMA table_xinfo(${quoteSqliteIdentifier(table.name)})`),
      );
      const foreignKeys = await db.all<
        ITableSchemaMetadata['foreignKeys'][number]
      >(
        sql.raw(
          `PRAGMA foreign_key_list(${quoteSqliteIdentifier(table.name)})`,
        ),
      );
      const indexes = [];
      for (const index of await db.all<
        ITableSchemaMetadata['indexes'][number]['definition']
      >(sql.raw(`PRAGMA index_list(${quoteSqliteIdentifier(table.name)})`))) {
        const indexedColumns = await db.all<
          ITableSchemaMetadata['indexes'][number]['columns'][number]
        >(sql.raw(`PRAGMA index_xinfo(${quoteSqliteIdentifier(index.name)})`));
        const [indexSql] = await db.all<{ sql: string }>(
          sql`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${index.name} AND tbl_name = ${table.name}`,
        );
        indexes.push({
          definition: index,
          columns: indexedColumns,
          sql: indexSql?.sql,
        });
      }
      validateTableSchemaMetadata(table, {
        sql: retained?.sql,
        columns,
        foreignKeys,
        indexes,
      });
    }
  } catch (error) {
    throw ensureZerospinError({
      code: 'node-storage-upgrade-schema-mismatch',
      error,
      preferCauseMessage: true,
    });
  }
}
