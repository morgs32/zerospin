import { sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

/** Reset incompatible browser storage while retaining its namespace lease and open handles. */
export async function resetNodeStorage(props: {
  db: SqliteRemoteDatabase;
  assertCurrent(): void;
}): Promise<void> {
  const { db, assertCurrent } = props;
  assertCurrent();
  const failures: unknown[] = [];
  try {
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    assertCurrent();
    await db.run(sql`BEGIN IMMEDIATE`);
    try {
      assertCurrent();
      const tables = await db.values<[string]>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      );
      for (const [name] of tables) {
        await db.run(sql.raw(`DROP TABLE "${name.replaceAll('"', '""')}"`));
      }
      await db.run(sql`PRAGMA user_version = 0`);
      assertCurrent();
      await db.run(sql`COMMIT`);
    } catch (cause) {
      failures.push(cause);
      try {
        await db.run(sql`ROLLBACK`);
      } catch (rollbackFailure) {
        failures.push(rollbackFailure);
      }
    }
  } catch (cause) {
    failures.push(cause);
  } finally {
    try {
      await db.run(sql`PRAGMA foreign_keys = ON`);
    } catch (restorationFailure) {
      failures.push(restorationFailure);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Node storage reset or cleanup failed');
  }
}
