import type { ISqliteTableDefinition } from '@zerospin/core/drizzle/definition/compileSqliteTableDefinition';
import {
  isApplicationSchemaObject,
  validateDbSchema,
} from '@zerospin/core/drizzle/provisionDb/validateDbSchema';
import type { IDb, IDbConfig } from '@zerospin/core/drizzle/types';
import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { applyMigratableDORepoMigrationTx } from './applyMigratableDORepoMigrationTx.js';
import {
  prepareMigrationHistory,
  validateMigrationHistory,
} from './migrationHistory.js';
import {
  APPLIED_MIGRATIONS_TABLE,
  readMigrationLedger,
} from './migrationLedger.js';
import { migrationLedgerDbConfig } from './migrationLedgerDbConfig.js';
import { provisionMigratableSchemaTx } from './provisionMigratableSchemaTx.js';
import type { IMigratableDORepoMigration } from './types.js';

type IMigrationActivation<CONFIG extends IDbConfig> = {
  ctx: DurableObjectState;
  db: IDb<CONFIG>;
  dbConfig: CONFIG;
  isBootstrapped: boolean;
  readMaterializedTables?:
    | ((db: Pick<IDb, 'get' | 'all'>) => readonly ISqliteTableDefinition[])
    | undefined;
  migrations: readonly IMigratableDORepoMigration[];
};

/** Inspect the retained ledger and physical graph without changing either. */
const readMigrationSource = Effect.fn('MigratableDORepo.readSource')(function* <
  CONFIG extends IDbConfig,
>(props: IMigrationActivation<CONFIG>) {
  const { db, dbConfig, isBootstrapped, migrations } = props;
  const history = yield* prepareMigrationHistory(migrations);
  if (
    dbConfig.definition.provisioning.some(
      table => table.name === APPLIED_MIGRATIONS_TABLE,
    )
  ) {
    return yield* makeZerospinError({
      code: 'migratable-do-repo-migrations-invalid',
      message: 'applied_migrations is reserved for framework migration history',
    });
  }
  const definition = {
    ...dbConfig.definition,
    provisioning: [
      ...dbConfig.definition.provisioning,
      ...migrationLedgerDbConfig.definition.provisioning,
    ],
  };
  const objects = yield* Effect.try({
    try: () =>
      db
        .all<{ name: string; type: string }>(
          sql`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view', 'trigger')`,
        )
        .filter(isApplicationSchemaObject),
    catch: error =>
      ensureZerospinError({
        code: 'migratable-do-repo-ledger-failed',
        message: 'Failed to inspect migration storage',
        error,
      }),
  });

  if (
    !objects.some(
      object =>
        object.type === 'table' && object.name === APPLIED_MIGRATIONS_TABLE,
    )
  ) {
    if (isBootstrapped || objects.length !== 0) {
      return yield* makeZerospinError({
        code: 'migratable-do-repo-storage-reset-required',
        message: 'Unstamped Durable Object storage requires empty storage',
      });
    }
    return { definition, history, installed: null };
  }

  const installedDefinition = (
    connection: Pick<IDb, 'get' | 'all'>,
    tables = dbConfig.definition.provisioning,
  ) => ({
    ...definition,
    provisioning: [
      ...tables,
      ...migrationLedgerDbConfig.definition.provisioning,
      ...(props.readMaterializedTables?.(connection) ?? []),
    ],
  });
  const applied = yield* readMigrationLedger(db);
  yield* validateMigrationHistory({ history, applied });
  const pending = history.slice(applied.length);
  if (pending.length === 0 || pending[0]?.sourceTables !== undefined) {
    yield* validateDbSchema(db, {
      definition: installedDefinition(db, pending[0]?.sourceTables),
    });
  }
  return {
    definition,
    history,
    installed: { applied, pending, installedDefinition },
  };
});

/** Refuse unsupported Agent storage before its registration can change the System catalog. */
export const preflightAgentMigration = Effect.fn(
  'MigratableDORepo.preflightAgentMigration',
)(function* <CONFIG extends IDbConfig>(props: IMigrationActivation<CONFIG>) {
  const { installed } = yield* readMigrationSource(props);
  if (
    installed === null &&
    !props.ctx.storage.kv.list({ limit: 1 })[Symbol.iterator]().next().done
  ) {
    return yield* makeZerospinError({
      code: 'migratable-do-repo-storage-reset-required',
      message:
        'Agent Node has retained key-value data but no compatible schema',
    });
  }
  if (
    installed?.pending[0] &&
    installed.pending[0].sourceTables === undefined
  ) {
    return yield* makeZerospinError({
      code: 'migratable-do-repo-migrations-invalid',
      message: 'Agent Node migration must declare the supported source tables',
    });
  }
});

/** Recheck the source under the activation gate before writing the schema or ledger. */
export const initializeMigratableSchema = Effect.fn(
  'MigratableDORepo.initializeSchema',
)(function* <CONFIG extends IDbConfig>(props: IMigrationActivation<CONFIG>) {
  const { ctx, db } = props;
  // Constructor failure discards unconfirmed writes, even after transactionSync.
  const confirmWrites = Effect.tryPromise({
    try: () => ctx.storage.sync(),
    catch: error =>
      ensureZerospinError({
        code: 'migratable-do-repo-durability-failed',
        message: 'Failed to confirm schema writes',
        error,
      }),
  });
  const { definition, history, installed } = yield* readMigrationSource(props);
  if (installed === null) {
    yield* provisionMigratableSchemaTx(db, { definition, history });
    yield* confirmWrites;
    return;
  }
  const { applied, pending, installedDefinition } = installed;
  for (let index = 0; index < pending.length; index++) {
    const migration = pending[index]!;
    if (index > 0 && migration.sourceTables !== undefined) {
      yield* validateDbSchema(db, {
        definition: installedDefinition(db, migration.sourceTables),
      });
    }
    yield* applyMigratableDORepoMigrationTx(db, {
      migration,
      history: history.slice(0, applied.length + index + 1),
      installedDefinition:
        index === pending.length - 1 ? installedDefinition : undefined,
    });
    yield* confirmWrites;
  }
});
