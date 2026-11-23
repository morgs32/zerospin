import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { compileSqliteTableDefinition } from '../drizzle/definition/compileSqliteTableDefinition.ts';
import { isApplicationSchemaObject } from '../drizzle/provisionDb/validateDbSchema.ts';

import {
  validateNodeMigrationHistory,
  type IPreparedNodeMigration,
} from './nodeMigrationHistory.ts';
import { validateNodeStorageSchema } from './validateNodeStorageSchema.ts';

export const nodeMigrationLedger = sqliteTable('applied_migrations', {
  migrationId: integer().primaryKey(),
  definitionChecksum: text().notNull(),
});
export const nodeMigrationLedgerDefinition =
  compileSqliteTableDefinition(nodeMigrationLedger);

/** An empty database is the only storage that may acquire a new baseline ledger. */
export async function readNodeMigrationState(
  db: SqliteRemoteDatabase,
  props: {
    history: readonly IPreparedNodeMigration[];
  },
) {
  const { history } = props;
  const objects = (
    await db.all<{ name: string; type: string }>(
      sql`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view', 'trigger')`,
    )
  ).filter(isApplicationSchemaObject);
  const [version] = await db.values<[number]>(sql`PRAGMA user_version`);
  const current = history.at(-1);
  if (current === undefined) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  if (version !== undefined && version[0] > current.toVersion) {
    throw makeZerospinError('node-storage-upgrade-newer');
  }
  if (objects.length === 0 && version?.[0] === 0) return undefined;
  if (
    !objects.some(
      object => object.type === 'table' && object.name === 'applied_migrations',
    )
  ) {
    throw makeZerospinError('node-storage-upgrade-ledger-missing');
  }
  await validateNodeStorageSchema(db, [nodeMigrationLedgerDefinition], {
    allowOtherTables: true,
  });
  const applied = await db
    .select()
    .from(nodeMigrationLedger)
    .orderBy(nodeMigrationLedger.migrationId);
  validateNodeMigrationHistory({ history, applied });
  const represented = history[applied.length - 1];
  if (represented === undefined || version?.[0] !== represented.toVersion) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  return {
    version: represented.toVersion,
    pending: history.slice(applied.length),
  };
}

/** Called inside the same transaction as fresh tables and producer metadata. */
export async function provisionNodeMigrationLedger(
  db: SqliteRemoteDatabase,
  history: readonly IPreparedNodeMigration[],
): Promise<void> {
  await db.run(sql.raw(nodeMigrationLedgerDefinition.createTable));
  for (const migration of history) {
    await db.insert(nodeMigrationLedger).values({
      migrationId: migration.id,
      definitionChecksum: migration.checksum,
    });
  }
  const current = history.at(-1);
  if (current === undefined) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  await db.run(sql.raw(`PRAGMA user_version = ${current.toVersion}`));
}
