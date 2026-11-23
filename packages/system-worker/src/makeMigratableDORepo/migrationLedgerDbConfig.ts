import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

/** Internal framework history; authored resource tables remain in their own graph. */
export const migrationLedgerDbConfig = makeDbConfig({
  tables: {
    appliedMigrations: makeTable({
      name: 'applied_migrations',
      shape: {
        migrationId: primitives.integer({ primaryKey: true }),
        definitionChecksum: primitives.text(),
      },
    }),
  },
});
