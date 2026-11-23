import { ensureZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { IDatabaseDefinition, ITx } from '../types.ts';

import { validateTableSchema } from './validateTableSchema.ts';

/** Provision inside the caller's synchronous transaction. */
export const provisionDbTables = Effect.fn('provisionDbTables')(function* (
  tx: ITx,
  props: { definition: IDatabaseDefinition },
) {
  const { definition } = props;

  for (const table of definition.provisioning) {
    const [existingTable] = tx.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table.name}`,
    );

    if (existingTable === undefined) {
      yield* executeStatement(tx, table.createTable);
    } else {
      yield* Effect.try({
        try: () => validateTableSchema(tx, table, { allowMissingIndexes: true }),
        catch: error => ensureZerospinError({
          code: 'provision-db-storage-reset-required',
          error,
          message: `Existing fixed table "${table.name}" differs from its declaration; empty storage is required`,
        }),
      });
    }

    for (const index of table.indexes) {
      const [existingIndex] = tx.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${index.name} AND tbl_name = ${table.name}`,
      );
      if (existingIndex === undefined) yield* executeStatement(tx, index.sql);
    }
  }
});

function executeStatement(tx: ITx, statement: string) {
  return Effect.try({
    try: () => tx.run(sql.raw(statement)),
    catch: error => ensureZerospinError({
      code: 'provision-db-failed',
      error,
      message: 'Failed to provision db',
    }),
  });
}
