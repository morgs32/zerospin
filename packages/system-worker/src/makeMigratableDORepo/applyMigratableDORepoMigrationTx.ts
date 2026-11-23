import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { validateDbSchema } from '@zerospin/core/drizzle/provisionDb/validateDbSchema';
import type { IDatabaseDefinition, ITx } from '@zerospin/core/drizzle/types';
import { ensureZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { validateMigrationHistory } from './migrationHistory.js';
import { readMigrationLedger, stampMigration } from './migrationLedger.js';
import type { IPreparedDORepoMigration } from './types.js';

/** Migration SQL, final graph validation and the ledger stamp commit together. */
export const applyMigratableDORepoMigrationTx = makeTx(
  'MigratableDORepo.applyMigrationTx',
)(function* (
  tx: ITx,
  props: {
    migration: IPreparedDORepoMigration;
    history: readonly IPreparedDORepoMigration[];
    installedDefinition: ((tx: ITx) => IDatabaseDefinition) | undefined;
  },
) {
  const { migration, installedDefinition, history } = props;
  for (const statement of migration.sql) {
    yield* Effect.try({
      try: () => tx.run(sql.raw(statement)),
      catch: error =>
        ensureZerospinError({
          code: 'migratable-do-repo-migration-failed',
          message: `Failed to apply migration ${migration.id} (${migration.name})`,
          error,
        }),
    });
  }
  yield* stampMigration(tx, migration);
  yield* validateMigrationHistory({
    history,
    applied: yield* readMigrationLedger(tx),
    complete: true,
  });
  if (installedDefinition) {
    yield* validateDbSchema(tx, { definition: installedDefinition(tx) });
  }
});
