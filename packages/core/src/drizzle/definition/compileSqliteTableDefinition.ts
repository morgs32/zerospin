import { getTableConfig, SQLiteDialect, type SQLiteTable } from 'drizzle-orm/sqlite-core';

import { parseSqliteIndexPredicate } from './parseSqliteIndexPredicate.ts';

export function quoteSqliteIdentifier(name: string): string {
  if (name === '' || name.includes('\0')) throw new Error('SQLite identifier must be non-empty and contain no NUL');
  return `"${name.replaceAll('"', '""')}"`;
}

function renderDefault(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  if (value instanceof Date && Number.isFinite(value.getTime())) return String(value.getTime());
  throw new Error('Unsupported SQLite authored default');
}

/** Compile the actual SQLite table contract once at its Drizzle adapter boundary. */
export function compileSqliteTableDefinition(table: SQLiteTable, options?: { foreignKeys?: boolean }) {
  const config = getTableConfig(table);
  if (config.checks.length > 0 || config.uniqueConstraints.length > 0) throw new Error(`Unsupported table-level constraints on "${config.name}"`);
  const primaryColumns = config.primaryKeys.length === 0 ? config.columns.filter(column => column.primary) : config.primaryKeys.flatMap(key => key.columns);
  const columns = config.columns.map(column => Object.freeze({
    name: column.name,
    sqlType: column.getSQLType(),
    primaryKeyPosition: primaryColumns.indexOf(column) + 1,
    notNull: column.notNull,
    unique: column.isUnique,
    autoIncrement: 'autoIncrement' in column && column.autoIncrement === true,
    defaultSql: renderDefault(column.default),
  }));
  const columnLines = columns.map(column => [
    quoteSqliteIdentifier(column.name), column.sqlType,
    ...(column.primaryKeyPosition > 0 && config.primaryKeys.length === 0 ? ['PRIMARY KEY'] : []),
    ...(column.autoIncrement ? ['AUTOINCREMENT'] : []),
    ...(column.notNull ? ['NOT NULL'] : []),
    ...(column.unique ? ['UNIQUE'] : []),
    ...(column.defaultSql === undefined ? [] : [`DEFAULT ${column.defaultSql}`]),
  ].join(' '));
  const primaryKeyLines = config.primaryKeys.map(key => `PRIMARY KEY (${key.columns.map(column => quoteSqliteIdentifier(column.name)).join(', ')})`);
  const foreignKeys = (options?.foreignKeys === false ? [] : config.foreignKeys).map(foreignKey => {
    const reference = foreignKey.reference();
    return Object.freeze({
      tableName: getTableConfig(reference.foreignTable).name,
      columns: Object.freeze(reference.columns.map(column => column.name)),
      foreignColumns: Object.freeze(reference.foreignColumns.map(column => column.name)),
      onDelete: foreignKey.onDelete ?? 'no action',
      onUpdate: foreignKey.onUpdate ?? 'no action',
    });
  });
  const foreignKeyLines = foreignKeys.map(key => `FOREIGN KEY (${key.columns.map(quoteSqliteIdentifier).join(', ')}) REFERENCES ${quoteSqliteIdentifier(key.tableName)} (${key.foreignColumns.map(quoteSqliteIdentifier).join(', ')}) ON UPDATE ${key.onUpdate.toUpperCase()} ON DELETE ${key.onDelete.toUpperCase()}`);
  const indexes = config.indexes.map(index => {
    const query = index.config.where === undefined ? undefined : new SQLiteDialect().sqlToQuery(index.config.where, 'indexes');
    const where = query === undefined ? undefined : parseSqliteIndexPredicate(query.sql);
    if (query !== undefined && (query.params.length !== 0 || where === undefined || !columns.some(column => column.name === where.column))) throw new Error(`Unsupported partial index "${index.config.name}"`);
    const columnNames = index.config.columns.map(column => {
      if (!('name' in column) || typeof column.name !== 'string') throw new Error(`Unsupported expression index "${index.config.name}"`);
      return column.name;
    });
    return Object.freeze({
      name: index.config.name,
      columns: Object.freeze(columnNames),
      unique: index.config.unique,
      where,
      sql: `CREATE ${index.config.unique ? 'UNIQUE ' : ''}INDEX ${quoteSqliteIdentifier(index.config.name)} ON ${quoteSqliteIdentifier(config.name)} (${columnNames.map(quoteSqliteIdentifier).join(', ')})${where === undefined ? '' : ` WHERE ${quoteSqliteIdentifier(where.column)} IS ${where.condition === 'isNotNull' ? 'NOT ' : ''}NULL`};`,
    });
  });
  return Object.freeze({
    name: config.name,
    columns: Object.freeze(columns),
    foreignKeys: Object.freeze(foreignKeys),
    indexes: Object.freeze(indexes),
    createTable: `CREATE TABLE ${quoteSqliteIdentifier(config.name)} (\n  ${[...columnLines, ...primaryKeyLines, ...foreignKeyLines].join(',\n  ')}\n);`,
  });
}

export type ISqliteTableDefinition = ReturnType<typeof compileSqliteTableDefinition>;
