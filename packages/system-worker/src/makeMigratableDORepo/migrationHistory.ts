import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IAppliedDORepoMigration } from './migrationLedger.js';
import type {
  IMigratableDORepoMigration,
  IPreparedDORepoMigration,
} from './types.js';

/** Hash exact SQL bytes outside transactions; never reorder authored history. */
export const prepareMigrationHistory = Effect.fn(
  'MigratableDORepo.prepareHistory',
)(function* (migrations: readonly IMigratableDORepoMigration[]) {
  let previousId = 0;
  for (const migration of migrations) {
    if (
      !Number.isSafeInteger(migration.id) ||
      migration.id <= previousId ||
      migration.name.trim() === ''
    ) {
      return yield* makeZerospinError({
        code: 'migratable-do-repo-migrations-invalid',
        message:
          'Migration IDs must be positive, strictly increasing safe integers with nonempty names',
      });
    }
    previousId = migration.id;
  }

  const history: IPreparedDORepoMigration[] = [];
  for (const migration of [
    { id: 0, name: 'baseline', sql: [] },
    ...migrations,
  ]) {
    const checksum = yield* Effect.promise(async () => {
      const bytes = new TextEncoder().encode(
        JSON.stringify([migration.id, migration.name, migration.sql]),
      );
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    });
    history.push({ ...migration, checksum });
  }
  return history;
});

/** A stored history is a complete prefix, including the baseline. */
export const validateMigrationHistory = Effect.fn(
  'MigratableDORepo.validateHistory',
)(function* (props: {
  history: readonly IPreparedDORepoMigration[];
  applied: readonly IAppliedDORepoMigration[];
  complete?: boolean;
}) {
  const { history, applied, complete = false } = props;
  if (
    applied.length === 0 ||
    applied.length > history.length ||
    (complete && applied.length !== history.length)
  ) {
    return yield* makeZerospinError({
      code: 'migratable-do-repo-history-invalid',
      message: 'Stored migration history is empty or newer than this Worker',
    });
  }
  for (let index = 0; index < applied.length; index++) {
    const row = applied[index]!;
    const migration = history[index]!;
    if (
      row.migrationId !== migration.id ||
      row.definitionChecksum !== migration.checksum
    ) {
      return yield* makeZerospinError({
        code: 'migratable-do-repo-history-invalid',
        message: `Stored migration ${row.migrationId} differs from the immutable supported history`,
      });
    }
  }
});
