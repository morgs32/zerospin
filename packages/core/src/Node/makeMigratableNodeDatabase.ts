import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { compileSqliteTableDefinition } from '../drizzle/definition/compileSqliteTableDefinition.ts';

import {
  prepareNodeMigrationHistory,
  type INodeStorageMigration,
} from './nodeMigrationHistory.ts';
import {
  nodeMigrationLedger,
  provisionNodeMigrationLedger,
  readNodeMigrationState,
} from './nodeMigrationLedger.ts';
import { validateNodeStorageSchema } from './validateNodeStorageSchema.ts';

/** Declare the current durable tables and the ordered changes to an existing producer's file. */
export function makeMigratableNodeDatabase(props: {
  baselineVersion: number;
  tables: readonly SQLiteTable[];
  publishedBaselineTables?: readonly SQLiteTable[];
  migrations: readonly INodeStorageMigration[];
}) {
  const current = props.tables.map(table =>
    compileSqliteTableDefinition(table),
  );
  const baseline = props.publishedBaselineTables?.map(table =>
    compileSqliteTableDefinition(table),
  );
  let prepared: ReturnType<typeof prepareNodeMigrationHistory> | undefined;
  const history = () => (prepared ??= prepareNodeMigrationHistory(props));
  const verifyCurrentTables = (db: SqliteRemoteDatabase) =>
    validateNodeStorageSchema(db, current, { allowOtherTables: true });
  return {
    async assertCurrentSchema(db: SqliteRemoteDatabase) {
      const state = await readNodeMigrationState(db, {
        history: await history(),
      });
      if (!state || state.pending.length !== 0) {
        throw makeZerospinError('node-storage-upgrade-history-invalid');
      }
      await verifyCurrentTables(db);
    },
    async initializeSchema(
      db: SqliteRemoteDatabase,
      options: {
        transaction<A>(work: () => Promise<A>): Promise<A>;
        create: boolean;
        readTables?: readonly { name: string }[];
        verifyBinding(): Promise<void>;
        initializeProducer(): Promise<void>;
        adoptPublished?: () => Promise<void>;
      },
    ) {
      if (
        options.readTables?.some(read =>
          current.some(
            durable => durable.name.toLowerCase() === read.name.toLowerCase(),
          ),
        )
      ) {
        throw makeZerospinError('node-storage-upgrade-schema-mismatch');
      }
      const migrations = await history();
      // The owning Node holds the exclusive lease across these transactions.
      const state = await options.transaction(async () => {
        const [version] = await db.values<[number]>(sql`PRAGMA user_version`);
        if (
          version !== undefined &&
          version[0] > migrations.at(-1)!.toVersion
        ) {
          throw makeZerospinError('node-storage-upgrade-newer');
        }
        await options.adoptPublished?.();
        const stored = await readNodeMigrationState(db, {
          history: migrations,
        });
        if (stored !== undefined) {
          await options.verifyBinding();
          if (stored.pending.length === 0) {
            await verifyCurrentTables(db);
          } else if (baseline && stored.version === props.baselineVersion) {
            await validateNodeStorageSchema(db, baseline, {
              allowOtherTables: true,
            });
          }
          return stored;
        }
        if (!options.create) throw makeZerospinError('node-storage-missing');
        for (const table of current) {
          await db.run(sql.raw(table.createTable));
          for (const index of table.indexes) await db.run(sql.raw(index.sql));
        }
        await options.initializeProducer();
        await provisionNodeMigrationLedger(db, migrations);
        await verifyCurrentTables(db);
        return undefined;
      });
      for (const migration of state?.pending ?? []) {
        await options.transaction(async () => {
          for (const statement of migration.sql) {
            try {
              await db.run(sql.raw(statement));
            } catch (error) {
              throw ensureZerospinError({
                code: 'node-storage-upgrade-migration-failed',
                error,
              });
            }
          }
          if (migration === migrations.at(-1)) await verifyCurrentTables(db);
          await db.insert(nodeMigrationLedger).values({
            migrationId: migration.id,
            definitionChecksum: migration.checksum,
          });
          await db.run(sql.raw(`PRAGMA user_version = ${migration.toVersion}`));
          // SQL cannot rewrite an earlier stamp and still commit as the next step.
          await readNodeMigrationState(db, { history: migrations });
        });
      }
      return { created: state === undefined };
    },
  };
}
