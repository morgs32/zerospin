import { validateTableSchema } from '@zerospin/core/drizzle/provisionDb/validateTableSchema';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { ensureZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { migrationLedgerDbConfig } from './migrationLedgerDbConfig.js';
import type { IPreparedDORepoMigration } from './types.js';

export const APPLIED_MIGRATIONS_TABLE = 'applied_migrations';

export type IAppliedDORepoMigration = {
  migrationId: number;
  definitionChecksum: string;
};

export function readMigrationLedger(db: IDb | ITx) {
  return Effect.try({
    try: () => {
      validateTableSchema(
        db,
        migrationLedgerDbConfig.definition.provisioning[0]!,
      );
      return db.all<IAppliedDORepoMigration>(
        sql`SELECT migrationId, definitionChecksum FROM applied_migrations ORDER BY migrationId`,
      );
    },
    catch: error =>
      ensureZerospinError({
        code: 'migratable-do-repo-ledger-failed',
        message: 'Failed to read migration history',
        error,
      }),
  });
}

/** Called inside the same transaction as provisioning or migration SQL. */
export function stampMigration(tx: ITx, migration: IPreparedDORepoMigration) {
  return Effect.try({
    try: () =>
      tx.run(
        sql`INSERT INTO applied_migrations (migrationId, definitionChecksum) VALUES (${migration.id}, ${migration.checksum})`,
      ),
    catch: error =>
      ensureZerospinError({
        code: 'migratable-do-repo-migration-stamp-failed',
        message: `Failed to stamp migration ${migration.id} (${migration.name})`,
        error,
      }),
  });
}
