import type { ISqliteTableDefinition } from '@zerospin/core/drizzle/definition/compileSqliteTableDefinition';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { sql } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

const SqliteColumnSchema = Schema.Struct({
  name: Schema.String,
  sqlType: Schema.String,
  primaryKeyPosition: Schema.Number,
  notNull: Schema.Boolean,
  unique: Schema.Boolean,
  autoIncrement: Schema.Boolean,
  defaultSql: Schema.optional(Schema.String),
});
const SqliteIndexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.Array(Schema.String),
  unique: Schema.Boolean,
  sql: Schema.declare<ISqliteTableDefinition['indexes'][number]['sql']>(
    (value): value is ISqliteTableDefinition['indexes'][number]['sql'] =>
      typeof value === 'string' &&
      /^CREATE (UNIQUE )?INDEX .+ ON .+ \(.+\).*;$/s.test(value),
  ),
  where: Schema.optional(
    Schema.Struct({
      column: Schema.String,
      condition: Schema.Literals(['isNull', 'isNotNull']),
    }),
  ),
});
export const AgentMaterializedTablesSchema = Schema.Array(
  Schema.Struct({
    name: Schema.String.check(Schema.isStartingWith('__agent_view_')),
    columns: Schema.Array(SqliteColumnSchema),
    foreignKeys: Schema.Array(
      Schema.Struct({
        tableName: Schema.String,
        columns: Schema.Array(Schema.String),
        foreignColumns: Schema.Array(Schema.String),
        onDelete: Schema.Literals([
          'no action',
          'restrict',
          'cascade',
          'set null',
          'set default',
        ]),
        onUpdate: Schema.Literals([
          'no action',
          'restrict',
          'cascade',
          'set null',
          'set default',
        ]),
      }),
    ),
    indexes: Schema.Array(SqliteIndexSchema),
    createTable: Schema.declare<ISqliteTableDefinition['createTable']>(
      (value): value is ISqliteTableDefinition['createTable'] =>
        typeof value === 'string' && /^CREATE TABLE .+ \(.+\);$/s.test(value),
    ),
  }),
);

/** Read the installed schema without provisioning or changing operational tables. */
export function readAgentMaterializedTables(db: Pick<IDb, 'all' | 'get'>) {
  if (
    db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'initializationState'`,
    ).length === 0
  ) {
    return [];
  }
  const row = db.get<{ materializedTables: string }>(
    sql`SELECT materializedTables FROM initializationState LIMIT 1`,
  );
  return row === undefined
    ? []
    : Schema.decodeUnknownSync(AgentMaterializedTablesSchema)(
        JSON.parse(row.materializedTables),
      ).map(table => ({
        ...table,
        columns: table.columns.map(column => ({
          ...column,
          defaultSql: column.defaultSql,
        })),
        indexes: table.indexes.map(index => ({ ...index, where: index.where })),
      }));
}

export function dropAgentMaterializedTables(tx: ITx) {
  for (const table of readAgentMaterializedTables(tx)) {
    tx.run(sql`DROP TABLE ${sql.identifier(table.name)}`);
  }
}
