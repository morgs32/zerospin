import { sql } from 'drizzle-orm';

import { quoteSqliteIdentifier, type ISqliteTableDefinition } from '../definition/compileSqliteTableDefinition.ts';
import { readSqliteIndexPredicate } from '../definition/parseSqliteIndexPredicate.ts';
import type { IDb, ITx } from '../types.ts';

export type ITableSchemaMetadata = {
  sql: string | undefined;
  columns: readonly { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number }[];
  foreignKeys: readonly { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string }[];
  indexes: readonly {
    definition: { name: string; unique: number; origin: string; partial: number };
    columns: readonly { name: string | null; desc: number; coll: string; key: number }[];
    sql: string | undefined;
  }[];
};

function refuse(table: ISqliteTableDefinition, reason: string): never {
  throw new Error(`Database table "${table.name}" differs from its declaration: ${reason}`);
}

/** Synchronous and asynchronous SQLite owners share these exact metadata checks. */
export function validateTableSchemaMetadata(table: ISqliteTableDefinition, metadata: ITableSchemaMetadata, options?: { allowMissingIndexes?: boolean }): void {
  if (metadata.sql === undefined) refuse(table, 'table is missing');
  const declaration = metadata.sql.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]/g, ' ');
  if (/\bAUTOINCREMENT\b/i.test(declaration) !== table.columns.some(column => column.autoIncrement)) refuse(table, 'AUTOINCREMENT differs');
  if (/\bCHECK\b|\bCOLLATE\b|\bDEFERRABLE\b|\bON\s+CONFLICT\b|\bSTRICT\s*;?\s*$|\bWITHOUT\s+ROWID\b/i.test(declaration)) refuse(table, 'undeclared table constraints');
  if (metadata.columns.length !== table.columns.length) refuse(table, 'column count differs');
  for (let index = 0; index < metadata.columns.length; index += 1) {
    const actual = metadata.columns[index]!;
    const expected = table.columns[index]!;
    if (actual.hidden !== 0 || actual.name !== expected.name || actual.type.toLowerCase() !== expected.sqlType.toLowerCase() || actual.notnull !== Number(expected.notNull) || actual.pk !== expected.primaryKeyPosition || actual.dflt_value !== (expected.defaultSql ?? null)) refuse(table, `column "${expected.name}" differs`);
  }
  const actualKeys = [...new Set(metadata.foreignKeys.map(key => key.id))].map(id => {
    const columns = metadata.foreignKeys.filter(key => key.id === id).sort((left, right) => left.seq - right.seq);
    const key = columns[0]!;
    return JSON.stringify([key.table, columns.map(column => column.from), columns.map(column => column.to), key.on_update.toLowerCase(), key.on_delete.toLowerCase()]);
  }).sort();
  const expectedKeys = table.foreignKeys.map(key => JSON.stringify([key.tableName, key.columns, key.foreignColumns, key.onUpdate, key.onDelete])).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) refuse(table, 'foreign keys differ');
  const uniqueColumns: string[] = [];
  for (const retainedIndex of metadata.indexes) {
    const index = retainedIndex.definition;
    const indexedColumns = retainedIndex.columns.filter(column => column.key === 1);
    if (indexedColumns.some(column => column.name === null || column.desc !== 0 || column.coll.toLowerCase() !== 'binary')) refuse(table, `index "${index.name}" columns differ`);
    const columnNames = indexedColumns.map(column => column.name);
    if (index.origin === 'u') {
      if (columnNames.length !== 1 || columnNames[0] === null || columnNames[0] === undefined) refuse(table, 'unique constraints differ');
      uniqueColumns.push(columnNames[0]);
    } else if (index.origin === 'c') {
      const expected = table.indexes.find(candidate => candidate.name === index.name);
      if (expected === undefined || index.partial !== Number(expected.where !== undefined) || index.unique !== Number(expected.unique) || JSON.stringify(columnNames) !== JSON.stringify(expected.columns)) refuse(table, `index "${index.name}" differs`);
      if (expected.where !== undefined) {
        const actual = retainedIndex.sql === undefined ? undefined : readSqliteIndexPredicate(retainedIndex.sql);
        if (actual === undefined || actual.column !== expected.where.column || actual.condition !== expected.where.condition) refuse(table, `index "${index.name}" predicate differs`);
      }
    } else if (index.origin === 'pk') {
      const primaryColumns = table.columns.filter(column => column.primaryKeyPosition > 0).sort((left, right) => left.primaryKeyPosition - right.primaryKeyPosition).map(column => column.name);
      if (JSON.stringify(columnNames) !== JSON.stringify(primaryColumns)) refuse(table, 'primary key index differs');
    } else {
      refuse(table, `index "${index.name}" has an unknown origin`);
    }
  }
  if (JSON.stringify(uniqueColumns.sort()) !== JSON.stringify(table.columns.filter(column => column.unique).map(column => column.name).sort())) refuse(table, 'unique constraints differ');
  if (options?.allowMissingIndexes !== true && table.indexes.some(expected => !metadata.indexes.some(index => index.definition.origin === 'c' && index.definition.name === expected.name))) refuse(table, 'declared index is missing');
}

export function validateTableSchema(db: IDb | ITx, table: ISqliteTableDefinition, options?: { allowMissingIndexes?: boolean }): void {
  const [retained] = db.all<{ sql: string }>(sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${table.name}`);
  const columns = db.all<ITableSchemaMetadata['columns'][number]>(sql.raw(`PRAGMA table_xinfo(${quoteSqliteIdentifier(table.name)})`));
  const foreignKeys = db.all<ITableSchemaMetadata['foreignKeys'][number]>(sql.raw(`PRAGMA foreign_key_list(${quoteSqliteIdentifier(table.name)})`));
  const indexes = db.all<ITableSchemaMetadata['indexes'][number]['definition']>(sql.raw(`PRAGMA index_list(${quoteSqliteIdentifier(table.name)})`)).map(index => {
    const indexedColumns = db.all<ITableSchemaMetadata['indexes'][number]['columns'][number]>(sql.raw(`PRAGMA index_xinfo(${quoteSqliteIdentifier(index.name)})`));
    const [indexSql] = db.all<{ sql: string }>(sql`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${index.name} AND tbl_name = ${table.name}`);
    return { definition: index, columns: indexedColumns, sql: indexSql?.sql };
  });
  validateTableSchemaMetadata(table, { sql: retained?.sql, columns, foreignKeys, indexes }, options);
}
