import { ensureZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { IDatabaseDefinition, IDb, ITx } from '../types.ts';

import { validateTableSchema } from './validateTableSchema.ts';

/** Platform-owned SQLite tables are outside the application schema graph. */
function isApplicationTableName(name: string): boolean {
  const normalized = name.toLowerCase();
  return !['sqlite_', '_cf_', '__cf_', '__miniflare_'].some(prefix => normalized.startsWith(prefix));
}

/** Only platform-owned tables are outside the declared application graph. */
export function isApplicationSchemaObject(object: { name: string; type: string }): boolean {
  const { name, type } = object;
  return type !== 'table' || isApplicationTableName(name);
}

/** Refuse physical schema drift without creating or repairing anything. */
export const validateDbSchema = Effect.fn('validateDbSchema')(
  (db: IDb | ITx, props: { definition: IDatabaseDefinition }) => {
    const { definition } = props;
    return Effect.try({
      try: () => {
        const objects = db.all<{ name: string; type: string }>(sql`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view', 'trigger')`)
          .filter(isApplicationSchemaObject);
        const unsupported = objects.find(object => object.type !== 'table');
        if (unsupported !== undefined) {
          throw new Error(`Database contains unsupported ${unsupported.type} "${unsupported.name}"`);
        }
        const tables = objects
          .map(table => table.name)
          .sort();
        const expectedTables = definition.provisioning.map(table => table.name).sort();
        if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
          throw new Error(`Database tables differ from their declaration: expected ${expectedTables.join(', ')}, found ${tables.join(', ')}`);
        }
        for (const table of definition.provisioning) validateTableSchema(db, table);
      },
      catch: error => ensureZerospinError({
        code: 'db-schema-mismatch',
        error,
        // The validator's schema facts explain the exact incompatibility.
        preferCauseMessage: true,
      }),
    });
  },
);
